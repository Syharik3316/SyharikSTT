import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import shutil
from pathlib import Path
from faster_whisper import WhisperModel
from docx import Document
import subprocess
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Транскрибация аудио/видео",
    root_path="",  # Может быть установлен через переменную окружения для работы за прокси
    # Убираем ограничения размера файлов
    max_request_size=None  # Не ограничиваем размер запросов
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Создаем директории для загрузок и результатов
# Определяем базовую директорию (в Docker это /app, локально - родительская)
BASE_DIR = Path(__file__).parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
RESULT_DIR = BASE_DIR / "results"
UPLOAD_DIR.mkdir(exist_ok=True)
RESULT_DIR.mkdir(exist_ok=True)

# Инициализация модели Whisper (загружается при старте)
model = None

def get_model():
    global model
    if model is None:
        # Пробуем несколько возможных путей
        possible_paths = [
            "/app/models/tiny",      # Если модель монтируется через volume
            "./models/tiny",         # Относительный путь в контейнере
            "tiny"                   # Попробовать загрузить из кэша
        ]
        
        model_path = None
        for path in possible_paths:
            if os.path.exists(path):
                model_path = path
                print(f"Found model at: {path}")
                break
        
        if not model_path:
            logger.error("Model not found in any of the paths: %s", possible_paths)
            logger.error("Current directory: %s", os.getcwd())
            logger.error("Contents of /app: %s", os.listdir("/app") if os.path.exists("/app") else "No /app")
            logger.error("Contents of /app/models: %s", os.listdir("/app/models") if os.path.exists("/app/models") else "No /app/models")
            raise RuntimeError(f"Модель не найдена. Проверьте путь: {possible_paths}")

        logger.info(f"Loading Whisper model from: {model_path} (local_files_only=True)")
        try:
            model = WhisperModel(
                model_path,
                device="cpu",
                compute_type="int8",
                local_files_only=True
            )
            logger.info("Model loaded successfully from local path")
        except RuntimeError as e:
            # Частая причина: ожидался CTranslate2 формат с model.bin
            msg = str(e)
            logger.exception("Ошибка при загрузке локальной модели: %s", msg)
            if 'model.bin' in msg or 'Unable to open file' in msg:
                # Попробуем загрузить модель по имени с разрешением на скачивание
                # Имя модели пытаемся получить из пути (например 'tiny')
                fallback_name = Path(model_path).name
                logger.info("Попытка fallback: загрузить модель '%s' с сети (local_files_only=False)", fallback_name)
                try:
                    model = WhisperModel(
                        fallback_name,
                        device="cpu",
                        compute_type="int8",
                        local_files_only=False
                    )
                    logger.info("Model loaded successfully via network as '%s'", fallback_name)
                except Exception as e2:
                    logger.exception("Не удалось загрузить модель по сети: %s", str(e2))
                    raise RuntimeError(
                        "Модель в каталоге не в формате CTranslate2 (нет model.bin). "
                        "Либо конвертируйте модель в формат CTranslate2 и поместите в /app/models/tiny, "
                        "либо обеспечьте доступ в интернет, чтобы автоматически скачать модель по имени (например 'tiny')."
                    )
            else:
                raise
    return model

def extract_audio(video_path: str, output_path: str):
    """Извлекает аудио из видео файла"""
    try:
        # Используем subprocess для прямого вызова ffmpeg
        cmd = [
            'ffmpeg',
            '-i', str(video_path),
            '-acodec', 'pcm_s16le',
            '-ac', '1',
            '-ar', '16k',
            '-y',  # Перезаписать выходной файл
            str(output_path)
        ]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False
        )
        if result.returncode != 0:
            print(f"Ошибка извлечения аудио: {result.stderr}")
            return False
        return True
    except Exception as e:
        print(f"Ошибка извлечения аудио: {e}")
        return False

def transcribe_audio(audio_path: str, language: str = None):
    """Транскрибирует аудио файл"""
    try:
        model = get_model()
        segments, info = model.transcribe(
            audio_path,
            language=language,
            beam_size=5,
            vad_filter=True
        )
        
        text = ""
        for segment in segments:
            text += segment.text + " "
        
        return text.strip()
    except Exception as e:
        logger.exception(f"Ошибка при транскрибации файла {audio_path}")
        raise HTTPException(status_code=500, detail=f"Ошибка транскрибации: {str(e)}")

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Главная страница"""
    try:
        # Логируем запрос для отладки
        logger.info(f"GET / - Headers: {dict(request.headers)}")
        frontend_path = Path(__file__).parent.parent / "frontend" / "index.html"
        if not frontend_path.exists():
            logger.error(f"Frontend file not found at: {frontend_path}")
            raise HTTPException(status_code=500, detail="Frontend file not found")
        with open(frontend_path, "r", encoding="utf-8") as f:
            content = f.read()
        logger.info(f"Successfully loaded frontend from: {frontend_path}")
        return content
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading page: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error loading page: {str(e)}")

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Загружает файл и начинает транскрибацию"""
    # Проверка формата файла
    allowed_extensions = {'.mp3', '.wav', '.m4a', '.ogg', '.mp4', '.mov', '.avi'}
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Неподдерживаемый формат файла")
    
    # Сохраняем файл
    file_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{file_id}{file_ext}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Определяем, это видео или аудио
    is_video = file_ext in {'.mp4', '.mov', '.avi'}
    
    # Если видео, извлекаем аудио
    audio_path = file_path
    if is_video:
        audio_path = UPLOAD_DIR / f"{file_id}.wav"
        if not extract_audio(str(file_path), str(audio_path)):
            raise HTTPException(status_code=500, detail="Ошибка извлечения аудио из видео")
    
    # Транскрибируем
    try:
        text = transcribe_audio(str(audio_path))
        
        # Сохраняем результат
        result_path = RESULT_DIR / f"{file_id}.txt"
        with open(result_path, "w", encoding="utf-8") as f:
            f.write(text)
        
        return {
            "file_id": file_id,
            "text": text,
            "filename": file.filename
        }
    except Exception as e:
        # Логируем стек трейс для диагностики
        logger.exception("Ошибка обработки загрузки файла")
        # Удаляем файлы при ошибке
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                logger.exception(f"Не удалось удалить файл {file_path}")
        if audio_path.exists() and audio_path != file_path:
            try:
                audio_path.unlink()
            except Exception:
                logger.exception(f"Не удалось удалить аудиофайл {audio_path}")
        raise HTTPException(status_code=500, detail=f"Ошибка сервера: {str(e)}")

class SaveTextRequest(BaseModel):
    file_id: str
    text: str
    filename: str = None

@app.post("/api/save")
async def save_text(request: SaveTextRequest):
    """Сохраняет отредактированный текст и название файла"""
    result_path = RESULT_DIR / f"{request.file_id}.txt"
    with open(result_path, "w", encoding="utf-8") as f:
        f.write(request.text)
    
    # Сохраняем название файла, если указано
    if request.filename:
        filename_path = RESULT_DIR / f"{request.file_id}.filename"
        with open(filename_path, "w", encoding="utf-8") as f:
            f.write(request.filename)
    
    return {"status": "saved"}

@app.get("/api/export/txt/{file_id}")
async def export_txt(file_id: str):
    """Экспортирует текст в .txt файл"""
    result_path = RESULT_DIR / f"{file_id}.txt"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    
    # Пытаемся прочитать сохраненное название файла
    filename_path = RESULT_DIR / f"{file_id}.filename"
    if filename_path.exists():
        with open(filename_path, "r", encoding="utf-8") as f:
            custom_filename = f.read().strip()
            if custom_filename:
                filename = f"{custom_filename}.txt"
            else:
                filename = f"transcription_{file_id}.txt"
    else:
        filename = f"transcription_{file_id}.txt"
    
    return FileResponse(
        result_path,
        media_type="text/plain",
        filename=filename
    )

@app.get("/api/export/docx/{file_id}")
async def export_docx(file_id: str):
    """Экспортирует текст в .docx файл"""
    result_path = RESULT_DIR / f"{file_id}.txt"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    
    # Читаем текст
    with open(result_path, "r", encoding="utf-8") as f:
        text = f.read()
    
    # Создаем DOCX
    doc = Document()
    doc.add_paragraph(text)
    
    # Сохраняем во временный файл
    temp_path = RESULT_DIR / f"{file_id}.docx"
    doc.save(temp_path)
    
    # Пытаемся прочитать сохраненное название файла
    filename_path = RESULT_DIR / f"{file_id}.filename"
    if filename_path.exists():
        with open(filename_path, "r", encoding="utf-8") as f:
            custom_filename = f.read().strip()
            if custom_filename:
                filename = f"{custom_filename}.docx"
            else:
                filename = f"transcription_{file_id}.docx"
    else:
        filename = f"transcription_{file_id}.docx"
    
    return FileResponse(
        temp_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename
    )

# Монтируем статические файлы
frontend_dir = Path(__file__).parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

# Добавляем прямые маршруты для статических файлов (для совместимости)
@app.get("/style.css")
async def get_style_css():
    """Возвращает CSS файл"""
    css_path = frontend_dir / "style.css"
    if css_path.exists():
        return FileResponse(css_path, media_type="text/css")
    raise HTTPException(status_code=404, detail="CSS file not found")

@app.get("/app.js")
async def get_app_js():
    """Возвращает JavaScript файл"""
    js_path = frontend_dir / "app.js"
    if js_path.exists():
        return FileResponse(js_path, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="JavaScript file not found")

@app.get("/favicon.ico")
async def get_favicon():
    """Возвращает favicon"""
    favicon_path = frontend_dir / "favicon.ico"
    if favicon_path.exists():
        return FileResponse(favicon_path, media_type="image/x-icon")
    # Возвращаем пустой ответ с 204, если favicon не найден
    from fastapi.responses import Response
    return Response(status_code=204)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8020)

