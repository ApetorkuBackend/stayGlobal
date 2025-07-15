# PowerShell script to run migration
Write-Host "🔄 Running apartment payment account migration..." -ForegroundColor Yellow
npx ts-node src/scripts/updateApartmentPaymentAccounts.ts
Write-Host "✅ Migration completed!" -ForegroundColor Green
