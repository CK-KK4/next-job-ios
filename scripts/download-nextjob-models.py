"""Download only the two licensed, hash-verified bundled models on the CI runner."""
from pathlib import Path
import hashlib
import os
import time
import urllib.request

DEST = Path(__file__).resolve().parent.parent / 'ios/PocketPal/nextjob'
MODELS = {
    'qwen2.5-0.5b-instruct-q4_k_m.gguf': (
        'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/9217f5db79a29953eb74d5343926648285ec7e67/qwen2.5-0.5b-instruct-q4_k_m.gguf',
        491400032, '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db'),
    'ggml-base-q8_0.bin': (
        'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q8_0.bin',
        81768585, 'c577b9a86e7e048a0b7eada054f4dd79a56bbfa911fbdacf900ac5b567cbb7d9'),
}

def valid(path, size, digest):
    if not path.is_file() or path.stat().st_size != size: return False
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest() == digest

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for name, (url, size, digest) in MODELS.items():
        target = DEST / name
        if valid(target, size, digest):
            print(f'Verified existing {name}'); continue
        partial = target.with_name(target.name + '.part')
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=120) as response, partial.open('wb') as output:
                    while data := response.read(1024 * 1024): output.write(data)
                if not valid(partial, size, digest): raise RuntimeError(f'Model integrity mismatch: {name}')
                os.replace(partial, target)
                print(f'Downloaded and verified {name}')
                break
            except Exception:
                partial.unlink(missing_ok=True)
                if attempt == 2: raise
                time.sleep(2 ** attempt)

if __name__ == '__main__': main()
