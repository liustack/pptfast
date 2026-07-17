on run argv
  set pptxPath to item 1 of argv
  try
    tell application "Microsoft PowerPoint" to quit saving no
  end try
  delay 2
  tell application "Microsoft PowerPoint"
    activate
    open (POSIX file pptxPath)
  end tell
  set verdict to "TIMEOUT"
  repeat with i from 1 to 30
    delay 1
    tell application "System Events"
      if exists process "Microsoft PowerPoint" then
        tell process "Microsoft PowerPoint"
          -- 修复弹窗：找 Repair 按钮
          repeat with w in windows
            try
              if exists (button "Repair" of w) then
                set verdict to "REPAIR_DIALOG"
                exit repeat
              end if
            end try
          end repeat
          if verdict is "TIMEOUT" then
            -- 正常打开：存在标题含文件名且不含 Repaired 的窗口
            repeat with w in windows
              try
                set wname to name of w
                if wname does not contain "Repaired" and wname is not "" then
                  set verdict to "OK"
                  exit repeat
                else if wname contains "Repaired" then
                  set verdict to "REPAIRED_TITLE"
                  exit repeat
                end if
              end try
            end repeat
          end if
        end tell
      end if
    end tell
    if verdict is not "TIMEOUT" then exit repeat
  end repeat
  try
    tell application "Microsoft PowerPoint" to quit saving no
  end try
  return verdict
end run
