# A+ Stock Scanner — Railway Ready

This project is built for Railway deployment.

## Stocks

AAOI, CELH, LITE, DIOD, GNRC, VSH, POWI, GEVG, FRMI, AXTI

## Railway setup

1. Upload the extracted contents of this ZIP to GitHub.
2. Deploy the GitHub repo on Railway.
3. Add this Railway variable:

POLYGON_API_KEY=your_polygon_key_here

4. Redeploy.
5. Generate a domain in Railway Networking.

## Required file structure

The GitHub repository must show:

package.json  
server.js  
README.md  
.env.example  
public/  

Inside public:

index.html  
styles.css  
app.js  

Do not upload the ZIP file itself. Upload the extracted contents.
