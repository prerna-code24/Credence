FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CREDENCE_COOKIE_SECURE=1

WORKDIR /app

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY app.py ./
COPY templates ./templates
COPY static ./static
COPY public ./public
RUN python -m py_compile app.py

RUN addgroup --system app && adduser --system --ingroup app --no-create-home app
USER app

EXPOSE 3000
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-3000} --workers 1 --threads 4 --access-logfile - --error-logfile - --timeout 60 app:app"]
