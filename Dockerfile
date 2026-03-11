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
    && rm -rf /var/lib/apt/lib/lists/*

# Set work directory
WORKDIR /app

# Copy the entire project structure
# This ensures that the local paths needed by pip are available
COPY . /app/

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip

# Install local engine components in the correct order
# We do this explicitly to guarantee they are found and installed
RUN pip install --no-cache-dir ./langflow/src/lfx && \
    pip install --no-cache-dir ./langflow/src/backend/base && \
    pip install --no-cache-dir ./langflow

# Install remaining requirements
RUN pip install --no-cache-dir -r requirements.txt

# Expose the port used by the FastAPI wrapper
EXPOSE 7860

# Command to run the backend
CMD ["uvicorn", "aiccore.wrapper.main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "4"]
