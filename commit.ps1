$message = Read-Host "Enter the commit message"

git add .
git commit -m "$message"

#git push origin main 