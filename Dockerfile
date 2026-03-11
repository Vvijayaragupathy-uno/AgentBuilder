# Use a stable Python base image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Step 1: Install langflow + langflow-base from PyPI (fast, no source needed)
# These are the published versions matching our local monorepo
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
        "langflow==1.8.0" \
        "langflow-base==0.8.0"

# Step 2: Copy ONLY the custom lfx package (small, not on PyPI)
COPY langflow/src/lfx /app/langflow/src/lfx
RUN pip install --no-cache-dir /app/langflow/src/lfx

# Step 3: Copy the AICCORE application code
COPY aiccore /app/aiccore
COPY requirements.txt /app/requirements.txt

# Step 4: Install remaining application dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose the port used by the FastAPI wrapper
EXPOSE 7860

# Command to run the backend
CMD ["uvicorn", "aiccore.wrapper.main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "4"]
