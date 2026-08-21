; Dark Kilrun chrome for MUI pages. Next/Install stay Windows-themed buttons
; (NSIS cannot recolor common-controls without a skin plugin).
!define MUI_BGCOLOR 080B12
!define MUI_TEXTCOLOR F8E8EA
!define MUI_INSTFILESPAGE_COLORS "F8E8EA 080B12"
!define MUI_LICENSEPAGE_BGCOLOR 080B12

!define MUI_CUSTOMFUNCTION_GUIINIT KilrunInstallerGuiInit
Function KilrunInstallerGuiInit
  SetCtlColors $HWNDPARENT F8E8EA 080B12
FunctionEnd
