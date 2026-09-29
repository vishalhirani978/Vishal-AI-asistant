"""
start_assistant.py — Launcher for Vishal Python Assistant
"""
import os
import sys

if __name__ == "__main__":
    app_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "python_app")
    sys.path.insert(0, app_dir)
    from main import main
    main()
