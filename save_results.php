<?php
$data = file_get_contents('php://input');
$file = fopen('shet.txt', 'a'); 
fwrite($file, $data . "\n");
fclose($file);
echo "Результаты успешно сохранены.";
?>