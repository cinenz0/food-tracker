import sys
import ctypes
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    import os
    import subprocess
    executable = Path(os.environ['LOCALAPPDATA']) / 'Programs' / 'FoodTracker' / 'Food Tracker.exe'
    if executable.is_file():
        subprocess.Popen([str(executable)])
        sys.exit(0)
    from app import main
    main()
except Exception as error:
    ctypes.windll.user32.MessageBoxW(0, str(error), 'Não foi possível abrir Alimentação', 16)
