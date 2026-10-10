<?php
declare(strict_types=1);

/** Save a small portrait and return its private filename. */
function memberSavePortrait(string $sourcePath, string $mime, string $photoDir, string $id): string
{
    if (!extension_loaded('gd') || !function_exists('imagewebp') || !(imagetypes() & IMG_WEBP)) {
        // The form prepares WebP in the browser; keep uploads working if GD is absent.
        $image = $mime === 'image/webp' ? @getimagesize($sourcePath) : false;
        $size = @filesize($sourcePath);
        if (is_array($image) && ($image['mime'] ?? '') === 'image/webp'
            && $image[0] <= 512 && $image[1] <= 512 && $size !== false && $size > 0 && $size <= 250 * 1024
            && is_uploaded_file($sourcePath)) {
            $filename = $id . '.webp';
            $destination = $photoDir . DIRECTORY_SEPARATOR . $filename;
            if (!move_uploaded_file($sourcePath, $destination)) throw new RuntimeException('Enregistrement de la photo impossible.');
            @chmod($destination, 0600);
            return $filename;
        }
        throw new RuntimeException('Le traitement des photos est temporairement indisponible.');
    }
    $source = match ($mime) {
        'image/jpeg' => @imagecreatefromjpeg($sourcePath),
        'image/png' => @imagecreatefrompng($sourcePath),
        'image/webp' => @imagecreatefromwebp($sourcePath),
        default => false,
    };
    if ($source === false) throw new InvalidArgumentException('Photo illisible.');
    $portrait = null;
    $temporary = null;
    try {
        $width = imagesx($source);
        $height = imagesy($source);
        $scale = min(1.0, 512 / max($width, $height));
        $targetWidth = max(1, (int) round($width * $scale));
        $targetHeight = max(1, (int) round($height * $scale));
        $portrait = imagecreatetruecolor($targetWidth, $targetHeight);
        if ($portrait === false) throw new RuntimeException('Traitement de la photo impossible.');
        imagealphablending($portrait, false);
        imagesavealpha($portrait, true);
        $clear = imagecolorallocatealpha($portrait, 0, 0, 0, 127);
        imagefill($portrait, 0, 0, $clear);
        if (!imagecopyresampled($portrait, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height)) {
            throw new RuntimeException('Traitement de la photo impossible.');
        }
        imagedestroy($source);
        $source = null;

        // Apply the camera orientation after resizing, so rotation uses little memory.
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $exif = @exif_read_data($sourcePath);
            $orientation = is_array($exif) ? (int) ($exif['Orientation'] ?? 1) : 1;
            if (in_array($orientation, [2, 4, 5, 7], true)) {
                imageflip($portrait, in_array($orientation, [2, 7], true) ? IMG_FLIP_HORIZONTAL : IMG_FLIP_VERTICAL);
            }
            $angle = match ($orientation) { 3 => 180, 5, 6, 7 => 270, 8 => 90, default => 0 };
            if ($angle !== 0) {
                $rotated = imagerotate($portrait, $angle, 0);
                if ($rotated === false) throw new RuntimeException('Orientation de la photo impossible.');
                imagedestroy($portrait);
                $portrait = $rotated;
            }
        }
        $temporary = @tempnam($photoDir, 'portrait-');
        if ($temporary === false) throw new RuntimeException('Enregistrement de la photo impossible.');
        $written = false;
        foreach ([78, 68, 58, 48] as $quality) {
            if (!@imagewebp($portrait, $temporary, $quality)) continue;
            clearstatcache(true, $temporary);
            $size = @filesize($temporary);
            if ($size !== false && $size > 0 && $size <= 250 * 1024) {
                $written = true;
                break;
            }
        }
        $image = $written ? @getimagesize($temporary) : false;
        if (!$written || !is_array($image) || ($image['mime'] ?? '') !== 'image/webp') {
            throw new RuntimeException('Compression de la photo impossible.');
        }
        $filename = $id . '.webp';
        $destination = $photoDir . DIRECTORY_SEPARATOR . $filename;
        @chmod($temporary, 0600);
        if (!@rename($temporary, $destination)) throw new RuntimeException('Enregistrement de la photo impossible.');
        $temporary = null;
        return $filename;
    } finally {
        if ($source !== null) imagedestroy($source);
        if ($portrait !== null) imagedestroy($portrait);
        if ($temporary !== null) @unlink($temporary);
    }
}
