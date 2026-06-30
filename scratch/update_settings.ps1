$path = 'd:\erp-new\erp system\erp-desktop\src\pages\Settings.jsx'
$lines = Get-Content $path
$newLines = @()
for ($i=0; $i -lt $lines.Count; $i++) {
    if ($i -eq 2548) {
        $newLines += '                  <label className="settings-segment">'
        $newLines += '                    <input'
        $newLines += '                      type="radio"'
        $newLines += '                      name="defaultPaymentVoucher80Template"'
        $newLines += '                      value="modern"'
        $newLines += '                      checked={defaultPaymentVoucher80Template === ''modern''}'
        $newLines += '                      onChange={(event) => setDefaultPaymentVoucher80Template(event.target.value)}'
        $newLines += '                    />'
        $newLines += '                    <span>عصري</span>'
        $newLines += '                  </label>'
    }
    $newLines += $lines[$i]
}
$newLines | Set-Content $path -Encoding UTF8
