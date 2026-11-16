FROM python:3.12-slim
WORKDIR /app
COPY server.py ./
COPY static ./static
RUN useradd --system vxt
USER vxt
ENV VXT_HOST=0.0.0.0 VXT_PORT=8686
EXPOSE 8686
HEALTHCHECK CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8686/healthz')"
CMD ["python", "server.py", "--no-browser"]
