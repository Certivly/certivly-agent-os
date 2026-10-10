; ================================================================
; AgentOS Inno Setup Script
; Generates Windows GUI Wizard Setup: AgentOS-Setup-1.0.0.exe
; ================================================================

#define MyAppName "AgentOS"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "AgentOS Core Team"
#define MyAppURL "https://github.com/agent-os/agent-os"
#define MyAppExeName "agentos.exe"

[Setup]
AppId={{5C16C42A-7DE8-41C8-97F2-92D95F77BA68}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist-installer
OutputBaseFilename=AgentOS-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ChangesEnvironment=yes
DisableProgramGroupPage=auto
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\bin\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "addtopath"; Description: "Add AgentOS to environment PATH (recommended)"; GroupDescription: "System Integration:"

[Files]
; Core CLI Standalone Executable & Launchers
Source: "..\bin\agentos.exe"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "..\bin\agentos.cmd"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "..\bin\agentos.ps1"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "..\bin\checksums.txt"; DestDir: "{app}\bin"; Flags: ignoreversion

; Desktop Application Distribution Bundle
Source: "..\apps\desktop\dist\*"; DestDir: "{app}\desktop"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\apps\desktop\package.json"; DestDir: "{app}\desktop"; Flags: ignoreversion

; Documentation & Legal
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\CHANGELOG.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\AgentOS Console"; Filename: "{app}\bin\agentos.cmd"; WorkingDir: "{userdocs}"; IconFilename: "{app}\bin\{#MyAppExeName}"
Name: "{group}\AgentOS Desktop App"; Filename: "{app}\bin\{#MyAppExeName}"; Parameters: "desktop"; WorkingDir: "{userdocs}"; IconFilename: "{app}\bin\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\AgentOS Desktop"; Filename: "{app}\bin\{#MyAppExeName}"; Parameters: "desktop"; WorkingDir: "{userdocs}"; Tasks: desktopicon

[Run]
Filename: "{app}\bin\{#MyAppExeName}"; Parameters: "desktop"; Description: "Launch AgentOS Desktop App"; Flags: nowait postinstall skipifsilent
Filename: "{app}\bin\{#MyAppExeName}"; Parameters: "--help"; Description: "View AgentOS CLI Help in terminal"; Flags: nowait postinstall skipifsilent unchecked

[Code]
// ===============================================================
// Pascal Script: Modify Environment PATH & Broadcast Change
// ===============================================================

const
  EnvironmentKey = 'Environment';

procedure RegisterPath(PathToAdd: string);
var
  Paths: string;
  RootKey: Integer;
begin
  if IsAdminInstallMode then
    RootKey := HKEY_LOCAL_MACHINE
  else
    RootKey := HKEY_CURRENT_USER;

  if RegQueryStringValue(RootKey, EnvironmentKey, 'Path', Paths) then
  begin
    if Pos(Uppercase(PathToAdd), Uppercase(Paths)) = 0 then
    begin
      Paths := Paths + ';' + PathToAdd;
      RegWriteStringValue(RootKey, EnvironmentKey, 'Path', Paths);
    end;
  end
  else
  begin
    RegWriteStringValue(RootKey, EnvironmentKey, 'Path', PathToAdd);
  end;
end;

procedure UnregisterPath(PathToRemove: string);
var
  Paths: string;
  P: Integer;
  RootKey: Integer;
begin
  if IsAdminInstallMode then
    RootKey := HKEY_LOCAL_MACHINE
  else
    RootKey := HKEY_CURRENT_USER;

  if RegQueryStringValue(RootKey, EnvironmentKey, 'Path', Paths) then
  begin
    P := Pos(Uppercase(PathToRemove), Uppercase(Paths));
    if P > 0 then
    begin
      Delete(Paths, P, Length(PathToRemove));
      // Clean up adjacent semicolons
      StringChange(Paths, ';;', ';');
      RegWriteStringValue(RootKey, EnvironmentKey, 'Path', Paths);
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and WizardIsTaskSelected('addtopath') then
  begin
    RegisterPath(ExpandConstant('{app}\bin'));
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    UnregisterPath(ExpandConstant('{app}\bin'));
  end;
end;
