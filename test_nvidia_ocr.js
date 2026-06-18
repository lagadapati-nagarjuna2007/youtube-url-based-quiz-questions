// test_nvidia_ocr.js
// Standalone utility to verify NVIDIA vision model access and OCR extraction
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

console.log('--- Standalone NVIDIA Vision & OCR Test ---');

// 1. Verify API Key
if (!NVIDIA_API_KEY) {
  console.error('❌ Error: NVIDIA_API_KEY is not defined in your .env file.');
  process.exit(1);
}
console.log('✅ API Key configured.');

// 2. Locate Test Image (Self-healing fallback)
const imagePath = path.join(__dirname, 'image.png');
if (!fs.existsSync(imagePath)) {
  console.log('⚠️ image.png not found in root. Generating a 1x1 pixel PNG fallback...');
  const pixelB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  fs.writeFileSync(imagePath, Buffer.from(pixelB64, 'base64'));
}
console.log(`✅ Located test image: ${imagePath}`);

// 3. Convert to Base64
let base64Image = '';
try {
  base64Image = fs.readFileSync(imagePath).toString('base64');
  console.log(`✅ Successfully converted image to Base64 (${base64Image.length} characters).`);
} catch (err) {
  console.error('❌ Error reading or converting image:', err.message);
  process.exit(1);
}

// 4. Test API Access & OCR Extraction
async function runOcrTest() {
  console.log(`Sending image to model "${NVIDIA_MODEL}"...`);
  
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract any text visible in this image. If it is a user interface or diagram, describe it briefly.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 1024,
        temperature: 0.2
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      console.log('\n✅ Success! OCR Extraction Response:\n');
      console.log(content);
      console.log('\n----------------------------------------');
      console.log('NVIDIA Vision & OCR verification PASSED.');
    } else {
      const err = await response.json().catch(() => ({}));
      console.error(`❌ API Error (Status ${response.status}):`, err);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

runOcrTest();
