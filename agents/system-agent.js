const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// ===== HELPERS =====
async function runCommand(cmd) {
  try {
    const { stdout, stderr } = await execAsync(cmd, { shell: 'powershell.exe' });
    console.log(`⚙️ System command output: ${stdout || '(none)'}`);
    if (stderr) console.warn(`⚙️ System command stderr: ${stderr}`);
    return { success: true };
  } catch (err) {
    console.error(`❌ System command failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ===== SHUTDOWN =====
async function shutdownPC(minutes) {
  const delay = minutes ? parseInt(minutes) : 0;
  const seconds = delay * 60;
  const label = delay > 0 ? `in ${delay} minute(s)` : 'now';
  console.log(`⚙️ Scheduling shutdown ${label}`);
  const result = await runCommand(`shutdown /s /t ${seconds}`);
  if (result.success) {
    return { success: true, message: `PC will shut down ${label}` };
  }
  return result;
}

// ===== RESTART =====
async function restartPC(minutes) {
  const delay = minutes ? parseInt(minutes) : 0;
  const seconds = delay * 60;
  const label = delay > 0 ? `in ${delay} minute(s)` : 'now';
  console.log(`⚙️ Scheduling restart ${label}`);
  const result = await runCommand(`shutdown /r /t ${seconds}`);
  if (result.success) {
    return { success: true, message: `PC will restart ${label}` };
  }
  return result;
}

// ===== CANCEL SHUTDOWN/RESTART =====
async function cancelShutdown() {
  console.log(`⚙️ Cancelling scheduled shutdown/restart`);
  const result = await runCommand(`shutdown /a`);
  if (result.success) {
    return { success: true, message: 'Scheduled shutdown/restart cancelled' };
  }
  return result;
}

// ===== LOCK SCREEN =====
async function lockScreen() {
  console.log(`⚙️ Locking screen`);
  const result = await runCommand(`Invoke-Command { rundll32.exe user32.dll,LockWorkStation }`);
  if (result.success) {
    return { success: true, message: 'Screen locked' };
  }
  return result;
}

// ===== SLEEP =====
async function sleepPC() {
  console.log(`⚙️ Putting PC to sleep`);
  // Use rundll32 to trigger sleep
  const result = await runCommand(`rundll32.exe powrprof.dll,SetSuspendState 0,1,0`);
  if (result.success) {
    return { success: true, message: 'PC is going to sleep' };
  }
  return result;
}

// ===== VOLUME CONTROL =====
async function setVolume(level) {
  const vol = Math.max(0, Math.min(100, parseInt(level)));
  console.log(`⚙️ Setting volume to ${vol}%`);
  // PowerShell script to set master volume using Windows Audio API
  const script = `
    $wshShell = New-Object -ComObject WScript.Shell;
    $vol = ${vol};
    # Set volume using nircmd-style approach via .NET
    Add-Type -TypeDefinition @"
      using System.Runtime.InteropServices;
      [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
      interface IAudioEndpointVolume {
        int f(); int g(); int h(); int i();
        int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
        int j();
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int k(); int l(); int m(); int n();
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
        int GetMute(out bool pbMute);
      }
      [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
      interface IMMDevice {
        int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
      }
      [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
      interface IMMDeviceEnumerator {
        int f();
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
      }
      [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
      class MMDeviceEnumeratorClass {}
"@
    $enumerator = [Activator]::CreateInstance([Type]::GetTypeFromCLSID([Guid]"BCDE0395-E52F-467C-8E3D-C4579291692E"))
    $endpoint = $null; $enumerator.GetDefaultAudioEndpoint(0, 1, [ref]$endpoint) | Out-Null
    $aev = $null; $id = [Guid]"5CDF2C82-841E-4546-9722-0CF74078229A"
    $endpoint.Activate([ref]$id, 23, 0, [ref]$aev) | Out-Null
    $aev.SetMasterVolumeLevelScalar($vol / 100.0, [Guid]::Empty) | Out-Null
    Write-Output "Volume set to $vol%"
  `;
  const result = await runCommand(script);
  if (result.success) {
    return { success: true, message: `Volume set to ${vol}%` };
  }
  // Fallback: try nircmd if available
  try {
    const nircmd = await runCommand(`nircmd.exe setsysvolume ${Math.round(vol * 655.35)}`);
    if (nircmd.success) return { success: true, message: `Volume set to ${vol}%` };
  } catch (_) { /* ignore */ }
  return { success: false, error: 'Could not set volume — try adjusting manually' };
}

// ===== MUTE/UNMUTE =====
async function muteAudio() {
  console.log(`⚙️ Toggling mute`);
  // Send the mute key via PowerShell
  const script = `
    $wshShell = New-Object -ComObject WScript.Shell
    $wshShell.SendKeys([char]173)
  `;
  const result = await runCommand(script);
  if (result.success) {
    return { success: true, message: 'Audio muted/unmuted' };
  }
  return result;
}

module.exports = {
  shutdownPC,
  restartPC,
  cancelShutdown,
  lockScreen,
  sleepPC,
  setVolume,
  muteAudio,
};
