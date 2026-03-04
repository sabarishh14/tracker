# 1. Use a lightweight, stable Python 3.11 environment
FROM python:3.11-slim

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy your requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Copy the rest of your backend code
COPY . .

# 5. Run Gunicorn, binding to Cloud Run's dynamic PORT
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 app:app