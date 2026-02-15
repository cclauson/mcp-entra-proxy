param (
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroup,

    [Parameter(Mandatory=$true)]
    [string]$FrontDoorProfileName,

    [Parameter(Mandatory=$true)]
    [string]$CustomDomainName,

    [Parameter(Mandatory=$true)]
    [string]$DnsZoneName,

    [Parameter(Mandatory=$true)]
    [string]$DnsZoneResourceGroup,

    [Parameter(Mandatory=$true)]
    [string]$Subdomain
)

# Check current validation state
Write-Host "Checking current validation state..."

$customDomainJson = az afd custom-domain show `
    --resource-group $ResourceGroup `
    --profile-name $FrontDoorProfileName `
    --custom-domain-name $CustomDomainName `
    --query "{validationState:domainValidationState}" `
    -o json

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to retrieve custom domain information."
    exit 1
}

$customDomain = $customDomainJson | ConvertFrom-Json
$validationState = $customDomain.validationState

Write-Host "Current validation state: $validationState"

if ($validationState -eq "Approved") {
    Write-Host "Domain is already validated. No action needed."
    exit 0
}

# Get the current validation token first (in case regeneration fails due to rate limit)
Write-Host "Retrieving current validation token..."
$tokenJson = az afd custom-domain show `
    --resource-group $ResourceGroup `
    --profile-name $FrontDoorProfileName `
    --custom-domain-name $CustomDomainName `
    --query "{validationToken:validationProperties.validationToken}" `
    -o json

$existingToken = $null
if ($LASTEXITCODE -eq 0) {
    $tokenResult = $tokenJson | ConvertFrom-Json
    $existingToken = $tokenResult.validationToken
    if ($existingToken) {
        Write-Host "Current token: $existingToken"
    }
}

# Try to regenerate validation token for a fresh token
Write-Host "Attempting to regenerate validation token..."
$regenerateOutput = az afd custom-domain regenerate-validation-token `
    --resource-group $ResourceGroup `
    --profile-name $FrontDoorProfileName `
    --custom-domain-name $CustomDomainName 2>&1

$regenerationSucceeded = $LASTEXITCODE -eq 0

if (-not $regenerationSucceeded) {
    # Check if this is a rate limit error
    if ($regenerateOutput -match "Rate limit exceeded") {
        Write-Host "WARNING: Token regeneration rate limited. Using existing token if available."
    } else {
        Write-Host "WARNING: Token regeneration failed: $regenerateOutput"
    }
}

# Get the validation token (either new or existing)
$validationToken = $null

if ($regenerationSucceeded) {
    # Wait for the new token to be available after regeneration
    Write-Host "Waiting for new validation token..."
    $maxAttempts = 12
    $attempt = 0

    while ($attempt -lt $maxAttempts -and -not $validationToken) {
        Start-Sleep -Seconds 10
        $attempt++
        Write-Host "  Attempt $attempt of $maxAttempts..."

        $tokenJson = az afd custom-domain show `
            --resource-group $ResourceGroup `
            --profile-name $FrontDoorProfileName `
            --custom-domain-name $CustomDomainName `
            --query "{validationToken:validationProperties.validationToken}" `
            -o json

        if ($LASTEXITCODE -eq 0) {
            $tokenResult = $tokenJson | ConvertFrom-Json
            $validationToken = $tokenResult.validationToken
        }
    }
} else {
    # Use existing token if regeneration failed
    $validationToken = $existingToken
}

if (-not $validationToken) {
    Write-Error "No validation token available. Cannot proceed with DNS validation."
    exit 1
}

Write-Host "Using validation token: $validationToken"

# Create the TXT record name (_dnsauth.subdomain)
$txtRecordName = "_dnsauth.$Subdomain"

Write-Host "Creating/updating TXT record '$txtRecordName' in DNS zone '$DnsZoneName'..."

# Check if TXT record already exists
$existingRecord = az network dns record-set txt show `
    --resource-group $DnsZoneResourceGroup `
    --zone-name $DnsZoneName `
    --name $txtRecordName `
    2>$null

if ($existingRecord) {
    Write-Host "TXT record already exists. Deleting old record..."
    az network dns record-set txt delete `
        --resource-group $DnsZoneResourceGroup `
        --zone-name $DnsZoneName `
        --name $txtRecordName `
        --yes
}

Write-Host "Creating TXT record with new token..."
az network dns record-set txt add-record `
    --resource-group $DnsZoneResourceGroup `
    --zone-name $DnsZoneName `
    --record-set-name $txtRecordName `
    --value $validationToken

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create TXT record."
    exit 1
}

Write-Host ""
Write-Host "TXT record created/updated successfully."
Write-Host ""
Write-Host "DNS Record Details:"
Write-Host "  Name: $txtRecordName.$DnsZoneName"
Write-Host "  Type: TXT"
Write-Host "  Value: $validationToken"
Write-Host ""
Write-Host "Note: DNS propagation may take a few minutes. Azure Front Door will automatically"
Write-Host "detect the TXT record and validate the domain."
