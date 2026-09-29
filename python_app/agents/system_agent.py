"""
system_agent.py — Windows system controls
"""

import asyncio
import subprocess
import logging

logger = logging.getLogger(__name__)


def _run_cmd(cmd: str, shell_type: str = "powershell") -> dict:
    try:
        if shell_type == "powershell":
            result = subprocess.run(
                ["powershell", "-NonInteractive", "-Command", cmd],
                capture_output=True, text=True, timeout=15
            )
        else:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)

        if result.returncode == 0:
            return {"success": True}
        else:
            return {"success": False, "error": result.stderr.strip() or result.stdout.strip()}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Command timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def shutdown_pc(minutes: int = 0) -> dict:
    seconds = int(minutes) * 60
    label = f"in {minutes} minute(s)" if minutes > 0 else "now"
    logger.info(f"Scheduling shutdown {label}")
    result = _run_cmd(f"shutdown /s /t {seconds}", shell_type="cmd")
    if result["success"]:
        return {"success": True, "message": f"PC will shut down {label}"}
    return result


def restart_pc(minutes: int = 0) -> dict:
    seconds = int(minutes) * 60
    label = f"in {minutes} minute(s)" if minutes > 0 else "now"
    logger.info(f"Scheduling restart {label}")
    result = _run_cmd(f"shutdown /r /t {seconds}", shell_type="cmd")
    if result["success"]:
        return {"success": True, "message": f"PC will restart {label}"}
    return result


def cancel_shutdown() -> dict:
    logger.info("Cancelling scheduled shutdown/restart")
    result = _run_cmd("shutdown /a", shell_type="cmd")
    if result["success"]:
        return {"success": True, "message": "Scheduled shutdown/restart cancelled"}
    return result


def lock_screen() -> dict:
    logger.info("Locking screen")
    result = _run_cmd("rundll32.exe user32.dll,LockWorkStation", shell_type="cmd")
    if result["success"]:
        return {"success": True, "message": "Screen locked"}
    return result


def sleep_pc() -> dict:
    logger.info("Putting PC to sleep")
    result = _run_cmd("rundll32.exe powrprof.dll,SetSuspendState 0,1,0", shell_type="cmd")
    if result["success"]:
        return {"success": True, "message": "PC is going to sleep"}
    return result


def set_volume(level: int) -> dict:
    vol = max(0, min(100, int(level)))
    logger.info(f"Setting volume to {vol}%")

    # PowerShell audio API
    script = f"""
    Add-Type -TypeDefinition @"
      using System.Runtime.InteropServices;
      [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
      interface IAudioEndpointVolume {{
        int f(); int g(); int h(); int i();
        int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
        int j(); int GetMasterVolumeLevelScalar(out float pfLevel);
        int k(); int l(); int m(); int n();
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
        int GetMute(out bool pbMute);
      }}
      [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
      interface IMMDevice {{
        int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
      }}
      [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
      interface IMMDeviceEnumerator {{
        int f();
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
      }}
      [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
      class MMDeviceEnumeratorClass {{}}
"@
    $enumerator = [Activator]::CreateInstance([Type]::GetTypeFromCLSID([Guid]"BCDE0395-E52F-467C-8E3D-C4579291692E"))
    $endpoint = $null; $enumerator.GetDefaultAudioEndpoint(0, 1, [ref]$endpoint) | Out-Null
    $aev = $null; $id = [Guid]"5CDF2C82-841E-4546-9722-0CF74078229A"
    $endpoint.Activate([ref]$id, 23, 0, [ref]$aev) | Out-Null
    $aev.SetMasterVolumeLevelScalar({vol} / 100.0, [Guid]::Empty) | Out-Null
    Write-Output "Volume set to {vol}%"
    """
    result = _run_cmd(script)
    if result["success"]:
        return {"success": True, "message": f"Volume set to {vol}%"}
    return {"success": False, "error": "Could not set volume — try adjusting manually"}


def mute_audio() -> dict:
    logger.info("Toggling mute")
    script = """
    $wshShell = New-Object -ComObject WScript.Shell
    $wshShell.SendKeys([char]173)
    """
    result = _run_cmd(script)
    if result["success"]:
        return {"success": True, "message": "Audio muted/unmuted"}
    return result
