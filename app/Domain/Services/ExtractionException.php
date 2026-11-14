<?php

declare(strict_types=1);

namespace App\Domain\Services;

/**
 * A file's text could not be extracted, for a reason worth telling the person
 * who uploaded it. The message is shown to them as-is, so keep it free of
 * paths and stack details.
 */
class ExtractionException extends \RuntimeException
{
}
