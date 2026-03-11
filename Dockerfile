# ─────────────────────────────────────────────────────────────────────────────
# Use the official Langflow image as the base — langflow is already installed.
# This eliminates the 5m 48s `pip install langflow` that was hitting the
# Railway 10-minute build timeout.
# ─────────────────────────────────────────────────────────────────────────────
FROM langflowai/langflow:1.8.0

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Set work directory
WORKDIR /app

# Install system deps needed by psycopg2 and other packages
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Step 1: Copy ONLY the small custom lfx package and install it
COPY langflow/src/lfx /app/langflow/src/lfx
RUN pip install --no-cache-dir /app/langflow/src/lfx

# Step 2: Copy AICCORE application code + requirements
COPY aiccore /app/aiccore
COPY requirements.txt /app/requirements.txt

# Step 3: Install remaining app dependencies (no langflow — already in base image)
RUN pip install --no-cache-dir -r requirements.txt

# Expose the port used by the FastAPI wrapper
EXPOSE 7860

# Command to run the backend
CMD ["uvicorn", "aiccore.wrapper.main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "4"]
