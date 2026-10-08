<?php
declare(strict_types=1);
if (!defined('NOMAD_ADMIN_API')) { http_response_code(404); exit; }
return [
    // Папка игры; admin.html и этот файл находятся рядом с index.php.
    'game_dir' => __DIR__,
    // Совместимо с изоляцией сайта: служебная папка внутри каталога игры.
    // Хеш пароля и копии лежат в PHP-файлах, закрытых от чтения через браузер.
    'private_dir' => __DIR__ . '/nomadquest-private',
    'setup_code_hash' => 'bc533f026ed28ad5b819ab4672d38580015539624093395aafef10f1250f2f87',
    'backup_limit' => 20,
];
