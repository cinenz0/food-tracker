# Build only application assets; never include personal data or credentials.
from PyInstaller.utils.hooks import collect_data_files

a = Analysis(['desktop.py'], pathex=[],
    binaries=[], datas=[('ui', 'ui'), ('seed.public.json', '.')]
    + collect_data_files('webview'),
    hiddenimports=['webview.platforms.edgechromium', 'webview.platforms.winforms', 'photo_assistant'],
    hookspath=[], hooksconfig={}, runtime_hooks=[],
    excludes=['tkinter', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6'], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [],
    name='Food Tracker', debug=False, bootloader_ignore_signals=False,
    strip=False, upx=False, console=False, icon='assets/food-tracker.ico')
