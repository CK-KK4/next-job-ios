"""Configure this isolated iOS fork without credentials or a developer membership."""
from pathlib import Path
import json
import plistlib
import re

root = Path(__file__).resolve().parent.parent
project = root / 'ios/PocketPal.xcodeproj/project.pbxproj'
text = project.read_text(encoding='utf-8')
text = '\n'.join(line for line in text.splitlines()
    if 'GoogleService-Info.plist' not in line and 'DEVELOPMENT_TEAM' not in line) + '\n'
text = re.sub(r'MARKETING_VERSION = [^;]+;', 'MARKETING_VERSION = 0.4.0;', text)
text = re.sub(r'CURRENT_PROJECT_VERSION = [^;]+;', 'CURRENT_PROJECT_VERSION = 6;', text)
text = text.replace('PRODUCT_BUNDLE_IDENTIFIER = ai.pocketpal;', 'PRODUCT_BUNDLE_IDENTIFIER = com.nextjob.app;')
text = text.replace('PRODUCT_BUNDLE_IDENTIFIER = ai.PocketPalTests;', 'PRODUCT_BUNDLE_IDENTIFIER = com.nextjob.app.tests;')
text = text.replace('CODE_SIGN_STYLE = Manual;', 'CODE_SIGN_STYLE = Automatic;')
text = text.replace('IPHONEOS_DEPLOYMENT_TARGET = 15.1;', 'IPHONEOS_DEPLOYMENT_TARGET = 17.0;')

def insert_member(target, key, value):
    global text
    pattern = r'(' + re.escape(target) + r' /\*[^\n]+\*/ = \{.*?' + key + r' = \(\n)'
    text, count = re.subn(pattern, lambda m: m[1] + value, text, count=1, flags=re.S)
    if count != 1: raise RuntimeError('Xcode group not found: ' + target)

entries = [
    ('01', 'NextJobModule.mm', 'sourcecode.cpp.objcpp', 'Sources'),
    ('02', 'NextJobFiles.mm', 'sourcecode.cpp.objcpp', 'Sources'),
    ('03', 'NextJobFiles.h', 'sourcecode.c.h', None),
    ('04', 'nextjob', 'folder', 'Resources'),
]
for suffix, name, filetype, phase in entries:
    ref, build = 'AA04000000000000000000' + suffix, 'BB04000000000000000000' + suffix
    if ref in text: continue
    line = f'\t\t{ref} /* {name} */ = {{isa = PBXFileReference; lastKnownFileType = {filetype}; path = PocketPal/{name}; sourceTree = "<group>"; }};\n'
    text = text.replace('/* End PBXFileReference section */', line + '/* End PBXFileReference section */')
    insert_member('13B07FAE1A68108700A75B9A', 'children', f'\t\t\t\t{ref} /* {name} */,\n')
    if phase:
        line = f'\t\t{build} /* {name} in {phase} */ = {{isa = PBXBuildFile; fileRef = {ref} /* {name} */; }};\n'
        text = text.replace('/* End PBXBuildFile section */', line + '/* End PBXBuildFile section */')
        target = '13B07F871A680F5B00A75B9A' if phase == 'Sources' else '13B07F8E1A680F5B00A75B9A'
        insert_member(target, 'files', f'\t\t\t\t{build} /* {name} in {phase} */,\n')

for index, (name, path, kind) in enumerate([
    ('Vision.framework', 'System/Library/Frameworks/Vision.framework', 'wrapper.framework'),
    ('PDFKit.framework', 'System/Library/Frameworks/PDFKit.framework', 'wrapper.framework'),
    ('ImageIO.framework', 'System/Library/Frameworks/ImageIO.framework', 'wrapper.framework'),
    ('UniformTypeIdentifiers.framework', 'System/Library/Frameworks/UniformTypeIdentifiers.framework', 'wrapper.framework'),
    ('AVFoundation.framework', 'System/Library/Frameworks/AVFoundation.framework', 'wrapper.framework'),
    ('libz.tbd', 'usr/lib/libz.tbd', 'sourcecode.text-based-dylib-definition'),
], 10):
    ref, build = f'AA04000000000000000000{index}', f'BB04000000000000000000{index}'
    if ref in text: continue
    text = text.replace('/* End PBXFileReference section */',
        f'\t\t{ref} /* {name} */ = {{isa = PBXFileReference; lastKnownFileType = {kind}; name = {name}; path = {path}; sourceTree = SDKROOT; }};\n/* End PBXFileReference section */')
    text = text.replace('/* End PBXBuildFile section */',
        f'\t\t{build} /* {name} in Frameworks */ = {{isa = PBXBuildFile; fileRef = {ref} /* {name} */; }};\n/* End PBXBuildFile section */')
    insert_member('2D16E6871FA4F8E400B85C8A', 'children', f'\t\t\t\t{ref} /* {name} */,\n')
    insert_member('13B07F8C1A680F5B00A75B9A', 'files', f'\t\t\t\t{build} /* {name} in Frameworks */,\n')
project.write_text(text, encoding='utf-8', newline='\n')

info = root / 'ios/PocketPal/Info.plist'
plist = plistlib.loads(info.read_bytes())
plist.update({
    'CFBundleDisplayName': '下一站',
    'NSCameraUsageDescription': '用于视频练面试的镜头预览；只有你开启附图并发送时，画面才交给所选 AI。',
    'NSMicrophoneUsageDescription': '用于语音面试和复盘录音。语音在本机转文字，点击发送后交给所选 AI 分析。',
    'NSPhotoLibraryUsageDescription': '用于选择截图并在本机识别文字，点击发送后将识别结果交给所选 AI。',
    'NSLocalNetworkUsageDescription': '仅在你配置本地网络 AI 服务时连接该服务。',
    'UIBackgroundModes': ['audio'],
})
plist.pop('GIDClientID', None)
plist['CFBundleURLTypes'] = [v for v in plist.get('CFBundleURLTypes', [])
    if not any('GOOGLE' in scheme for scheme in v.get('CFBundleURLSchemes', []))]
info.write_bytes(plistlib.dumps(plist, sort_keys=False))
# Ordinary personal signing needs no Siri, Sign in with Apple, or memory entitlement.
(root / 'ios/PocketPal/PocketPal.entitlements').write_bytes(plistlib.dumps({}))

delegate = root / 'ios/PocketPal/AppDelegate.swift'
text = delegate.read_text(encoding='utf-8')
old = '    RNFBAppCheckModule.sharedInstance() \n    FirebaseApp.configure()'
new = '''    if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
      RNFBAppCheckModule.sharedInstance()
      FirebaseApp.configure()
    }'''
if old in text: text = text.replace(old, new)
elif 'if Bundle.main.path(forResource: "GoogleService-Info"' not in text:
    raise RuntimeError('Firebase startup pattern changed; review before building')
delegate.write_text(text, encoding='utf-8', newline='\n')

package_path = root / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['version'] = '0.4.0'
package['codegenConfig']['ios'] = {'modulesProvider': {'NextJobModule': 'NextJobModule'}}
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

env = root / '.env'
if not env.exists():
    env.write_text('FIREBASE_FUNCTIONS_URL=https://unused.invalid\nSUPABASE_URL=\nSUPABASE_ANON_KEY=\nPALSHUB_API_BASE_URL=\nAPP_URL=pocketpal://app\nGOOGLE_IOS_CLIENT_ID=\nGOOGLE_WEB_CLIENT_ID=\n', encoding='utf-8')
config = root / 'ios/Config/Env.xcconfig'
if not config.exists(): config.write_text('// Personal local-model build. No credentials.\n', encoding='utf-8')
print('Configured Next Job iOS 0.4.0 (6), iOS 17+, personal signing, no account secrets.')
