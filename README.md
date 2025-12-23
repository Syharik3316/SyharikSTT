# SyharikSTT — локальная транскрибация (offline)

Цель проекта: полностью офлайн-транскрибация аудио/видео с использованием локально размещённой модели.

Запуск проекта:

Из корня проекта

```
docker compose build --no-cache
```

```
docker compose up -d
```

Проект запустится на порту 8020.

Ссылка для установки модели Whisper-tiny (можно любую другую по желанию):

https://huggingface.co/openai/whisper-tiny

Распаковать модель в директорию ./models/tiny/
Если такой директории нет - создать.

Важное требование
- Модель должна быть в формате CTranslate2 (директория с файлом `model.bin`). Проект использует `faster-whisper` + `ctranslate2` и ожидает модель в каталоге `./models/tiny` (или другом подкаталоге внутри `./models`).

Если при запуске вы видите ошибку вида:

```
RuntimeError: Unable to open file 'model.bin' in model '/app/models/tiny'
```

это значит, что в `./models/tiny` находится репозиторий модели в формате Hugging Face (safetensors/pytorch), а не конвертированная CTranslate2 модель.

Как подготовить офлайн-модель (общее руководство)

1) На машине с доступом в интернет (или локальной установкой инструментов) конвертируйте модель в формат CTranslate2.
   - Установите `ctranslate2` и `transformers` в виртуальной среде (на хосте):

```bash
python -m pip install ctranslate2 transformers sentencepiece
```

   - Используйте инструмент конвертации CTranslate2. Примерная команда (в зависимости от версии и установленных утилит):

```bash
# пример команды — замените <hf-model-id> на вашу модель (например 'openai/whisper-tiny')
python -m ctranslate2.converters.transformers --model <hf-model-id> --output_dir ./ct2-tiny
```

   В некоторых версиях утилита может называться `ct2-transformers-converter` или иметь другой интерфейс. Если вы используете другую утилиту для конвертации — цель одна: получить каталог с `model.bin` и сопутствующими файлами.

2) Скопируйте полученный каталог в репозиторий проекта как `./models/tiny` (замените существующий):

```bash
rm -rf /path/to/SyharikSTT/models/tiny
cp -r ./ct2-tiny /path/to/SyharikSTT/models/tiny
```

3) Cоберите и запустите контейнер (в корне проекта):

```powershell
docker-compose up --build -d
docker-compose logs -f transcription
```
