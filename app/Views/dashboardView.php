<?php

/** @var string $base_path Injected by HomeController. */
$base = hs($base_path ?? '');
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <script>
        // Pick light/dark before the page draws, so there's no white flash.
        try {
            var p = localStorage.getItem("wreads:theme") || "system";
            var dark = p === "dark" || (p === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
            document.documentElement.dataset.theme = dark ? "dark" : "light";
        } catch (e) {}
    </script>
    <title>Dashboard · wreads</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,800;1,9..144,400&family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= $base ?>/assets/css/dashboard.css">
    <script>
        window.WREADS = { basePath: "<?= $base ?>" };
    </script>
</head>

<body>
    <div id="root"></div>
    <noscript>wreads needs JavaScript turned on.</noscript>
    <script type="module" src="<?= $base ?>/assets/js/dashboard.js"></script>
</body>

</html>
