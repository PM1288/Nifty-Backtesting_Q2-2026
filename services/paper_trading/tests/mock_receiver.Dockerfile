FROM python:3.12-slim
WORKDIR /app
COPY tests/mock_receiver.py .
USER 65534:65534
EXPOSE 8099
CMD ["python","mock_receiver.py"]
