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

Проект запустится на порту 80.

# Проект работает с такими моделями как:

openai/whisper-tiny - Протестировано
openai/whisper-base
openai/whisper-medium - Протестировано
openai/whisper-large
openai/whisper-large-v2 - Протестировано

!!! openai/whisper-large-v3 - Не работает !!!

# Пример установки локальной модели:

Ссылка для установки модели Whisper-tiny (можно любую другую по желанию.):

https://huggingface.co/openai/whisper-tiny

1) Распаковать модель локально в любую директорию.

2) На машине с доступом в интернет (или локальной установкой инструментов) конвертируйте модель в формат CTranslate2.
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

3) Скопируйте полученный каталог в репозиторий проекта как `./models/tiny`

```bash
cp -r ./ct2-tiny /path/to/SyharikSTT/models/tiny
```

4) Измените имя используемой модели в файле app.py внутри функции get_model

```app.py
        possible_paths = [
            "/app/models/tiny",
            "./models/tiny",
            "tiny"
        ]
```

6) Cоберите и запустите контейнер (в корне проекта):

```powershell
docker-compose up --build -d
docker-compose logs -f
```

# Обновление V1.2:

Добавлена локальная история транскрибаций для избежания казусов по случайному закрытия результатов транскрибации.

Исправлены проблемы с редактированием, сохранением и экспортом результата транскрибации в форматы TXT и DOCX.

Добавлено более расширенное описание проекта.
