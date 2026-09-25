FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev gcc \
        tesseract-ocr tesseract-ocr-eng tesseract-ocr-hun \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Never run the app as root: a compromised process can't touch the rest of the image.
RUN useradd --create-home --uid 1000 spendly && chown -R spendly /app
USER spendly

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
