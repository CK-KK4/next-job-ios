from pathlib import Path
import plistlib
import sys
from importlib.util import spec_from_file_location, module_from_spec

app = Path(sys.argv[1]).resolve()
info = plistlib.loads((app / 'Info.plist').read_bytes())
assert info['CFBundleDisplayName'] == '下一站'
assert info['CFBundleShortVersionString'] == '0.4.0'
assert info['CFBundleIdentifier'] == 'com.nextjob.app'
assert 'audio' in info['UIBackgroundModes']
assert (app / 'main.jsbundle').stat().st_size > 10000
assert (app / info['CFBundleExecutable']).stat().st_size > 10000
spec = spec_from_file_location('models', Path(__file__).with_name('download-nextjob-models.py'))
models = module_from_spec(spec)
spec.loader.exec_module(models)
for name, (_, size, digest) in models.MODELS.items():
    assert models.valid(app / 'nextjob' / name, size, digest), name
print('Verified iOS metadata, background-audio mode, JavaScript, executable and bundled model hashes.')
