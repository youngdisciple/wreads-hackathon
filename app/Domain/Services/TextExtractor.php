<?php

declare(strict_types=1);

namespace App\Domain\Services;

use Smalot\PdfParser\Parser as PdfParser;

/**
 * Turns an uploaded file (PDF, DOCX, TXT, MD) into short, typeable "pages".
 *
 * - PDFs keep one entry per page (or slide); headers/footers repeated on most pages are removed.
 * - Other files are split into chunks of about CHUNK_WORDS words.
 * - Long pages are split too, so no single typing test is too long.
 * - Symbols you can't type on a normal keyboard (bullets, arrows, fancy quotes) are removed or replaced.
 */
class TextExtractor
{
    /** Pages longer than this are split into smaller chunks. */
    private const MAX_WORDS = 150;
    /** Target size of each chunk when splitting. */
    private const CHUNK_WORDS = 100;
    /** Pages with fewer words than this are dropped. */
    private const MIN_WORDS = 4;
    /** Short pages are merged with the next one until they reach this many words. */
    private const MERGE_BELOW_WORDS = 25;
    /** A line on at least this share of pages counts as a header/footer. */
    private const REPEATED_LINE_SHARE = 0.4;

    /** Separator used when the pages are stored together in documents.content. */
    public const PAGE_SEPARATOR = "\n\n";

    /** @return string[] typeable pages, in order */
    public function extract(string $path, string $extension): array
    {
        $rawPages = match ($extension) {
            'pdf' => $this->pdfPages($path),
            'docx' => [$this->docxText($path)],
            'txt', 'md' => [(string) file_get_contents($path)],
            default => [],
        };

        $rawPages = $this->removeRepeatedLines($rawPages);

        $cleaned = [];
        foreach ($rawPages as $raw) {
            $text = $this->clean($raw);
            // Skip near-empty pages and slides repeated back to back (animation builds).
            if ($this->wordCount($text) < self::MIN_WORDS || $text === end($cleaned)) {
                continue;
            }
            $cleaned[] = $text;
        }

        $pages = [];
        $limit = count($rawPages) === 1 ? self::CHUNK_WORDS : self::MAX_WORDS;
        foreach ($this->mergeShort($cleaned) as $text) {
            array_push($pages, ...$this->split($text, $limit));
        }
        return $pages;
    }

    public function wordCount(string $text): int
    {
        $text = trim($text);
        return $text === '' ? 0 : count(preg_split('/\s+/u', $text));
    }

    /** @return string[] */
    private function pdfPages(string $path): array
    {
        if (!class_exists(PdfParser::class)) {
            throw new \RuntimeException('PDF text extraction is unavailable. Run composer install to install the PDF parser.');
        }
        try {
            $pages = (new PdfParser())->parseFile($path)->getPages();
            return array_map(fn ($page) => (string) $page->getText(), $pages);
        } catch (\Throwable $e) {
            error_log('PDF text extraction failed: ' . $e->getMessage());
            return []; // encrypted or broken PDF (scanned PDFs just have no text)
        }
    }

    private function docxText(string $path): string
    {
        if (!class_exists(\ZipArchive::class)) {
            return '';
        }
        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) {
            return '';
        }
        $xml = (string) $zip->getFromName('word/document.xml');
        $zip->close();
        $xml = str_replace(['</w:p>', '<w:tab/>'], ["\n", ' '], $xml);
        return html_entity_decode(strip_tags($xml), ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    /**
     * Removes lines (slide titles, footers, course names) that show up on many pages.
     *
     * @param string[] $pages
     * @return string[]
     */
    private function removeRepeatedLines(array $pages): array
    {
        if (count($pages) < 3) {
            return $pages;
        }

        $seen = [];
        foreach ($pages as $page) {
            foreach (array_unique($this->lines($page)) as $line) {
                $seen[$line] = ($seen[$line] ?? 0) + 1;
            }
        }
        $minPages = max(2, (int) ceil(count($pages) * self::REPEATED_LINE_SHARE));
        $repeated = array_keys(array_filter($seen, fn ($n) => $n >= $minPages));
        if (!$repeated) {
            return $pages;
        }

        return array_map(
            fn ($page) => implode("\n", array_filter(
                $this->lines($page),
                fn ($line) => !in_array($line, $repeated, true)
            )),
            $pages
        );
    }

    /**
     * Joins short pages (title slides, one-liners) with the pages after them.
     *
     * @param string[] $pages
     * @return string[]
     */
    private function mergeShort(array $pages): array
    {
        $merged = [];
        $buffer = '';
        foreach ($pages as $page) {
            $buffer = $buffer === '' ? $page : $buffer . ' ' . $page;
            if ($this->wordCount($buffer) >= self::MERGE_BELOW_WORDS) {
                $merged[] = $buffer;
                $buffer = '';
            }
        }
        if ($buffer !== '') {
            if ($merged && $this->wordCount($buffer) < self::MERGE_BELOW_WORDS) {
                $merged[count($merged) - 1] .= ' ' . $buffer;
            } else {
                $merged[] = $buffer;
            }
        }
        return $merged;
    }

    /** @return string[] trimmed, non-empty lines */
    private function lines(string $text): array
    {
        $lines = array_map('trim', preg_split('/\R/u', $text));
        return array_values(array_filter($lines, fn ($l) => $l !== ''));
    }

    /** Make text typeable on a normal keyboard and put it on one line. */
    private function clean(string $text): string
    {
        $text = strtr($text, [
            "\u{2018}" => "'", "\u{2019}" => "'", "\u{201A}" => "'", "\u{2032}" => "'",
            "\u{201C}" => '"', "\u{201D}" => '"', "\u{201E}" => '"', "\u{2033}" => '"',
            "\u{2010}" => '-', "\u{2011}" => '-', "\u{2012}" => '-', "\u{2013}" => '-',
            "\u{2014}" => '-', "\u{2212}" => '-',
            "\u{2192}" => '->', "\u{2190}" => '<-', "\u{21D2}" => '=>', "\u{2194}" => '<->',
            "\u{2264}" => '<=', "\u{2265}" => '>=', "\u{2260}" => '!=', "\u{00D7}" => 'x',
            "\u{2026}" => '...', "\u{00A0}" => ' ', "\u{2009}" => ' ', "\u{202F}" => ' ',
            "\u{FB00}" => 'ff', "\u{FB01}" => 'fi', "\u{FB02}" => 'fl', "\u{FB03}" => 'ffi', "\u{FB04}" => 'ffl',
        ]);

        $text = preg_replace('~https?://\S+~u', '', $text);           // links aren't worth typing
        $text = preg_replace('/([-_=.*~#])\1{3,}/u', ' ', $text);    // ------- and ....... lines
        $text = preg_replace('/-\R\s*/u', '-', $text);               // re-join words broken across lines ("bit-by-\nbit")
        // Keep letters (accents too), numbers, marks and normal keyboard characters; drop bullets and other symbols.
        $text = preg_replace('/[^\p{L}\p{M}\p{N}\x20-\x7E\s]/u', ' ', $text);
        $text = preg_replace('/\s+/u', ' ', $text);
        $text = preg_replace('/\s+([.,;!?)])/u', '$1', $text);      // "word ." -> "word."

        return trim((string) $text);
    }

    /**
     * Splits text into chunks of about $maxWords, ending on a sentence when possible.
     *
     * @return string[]
     */
    private function split(string $text, int $maxWords): array
    {
        if ($this->wordCount($text) <= $maxWords) {
            return [$text];
        }

        $sentences = preg_split('/(?<=[.!?])\s+/u', $text);
        $chunks = [];
        $current = '';
        foreach ($sentences as $sentence) {
            // A single huge "sentence" (no punctuation) is cut by word count.
            foreach ($this->cutByWords($sentence, self::CHUNK_WORDS) as $piece) {
                $candidate = $current === '' ? $piece : $current . ' ' . $piece;
                if ($current !== '' && $this->wordCount($candidate) > self::CHUNK_WORDS) {
                    $chunks[] = $current;
                    $current = $piece;
                } else {
                    $current = $candidate;
                }
            }
        }
        if ($current !== '') {
            // Fold a tiny last chunk into the previous one.
            if ($chunks && $this->wordCount($current) < self::MIN_WORDS * 3) {
                $chunks[count($chunks) - 1] .= ' ' . $current;
            } else {
                $chunks[] = $current;
            }
        }
        return $chunks;
    }

    /** @return string[] */
    private function cutByWords(string $text, int $size): array
    {
        $words = preg_split('/\s+/u', trim($text));
        return array_map(fn ($part) => implode(' ', $part), array_chunk($words, $size));
    }
}
