const fetch = require('node-fetch');

async function testAudioPlayback() {
  const baseUrl = 'http://localhost:8000';
  
  try {
    console.log('🎵 Testing audio playback...');
    
    // Test voice synthesis
    console.log('1. Testing voice synthesis...');
    const synthesisResponse = await fetch(`${baseUrl}/api/agents/voice/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'Hello, this is a test of the voice synthesis system.',
        voice: 'elevenlabs_neural',
        speed: 1.0,
        emotion: 'friendly',
        language: 'en-US',
        provider: 'elevenlabs',
        quality: 'balanced'
      }),
    });
    
    if (!synthesisResponse.ok) {
      throw new Error(`Voice synthesis failed: ${synthesisResponse.status}`);
    }
    
    const synthesisResult = await synthesisResponse.json();
    console.log('✅ Voice synthesis successful:', synthesisResult);
    
    // Test audio retrieval
    console.log('2. Testing audio retrieval...');
    const audioResponse = await fetch(`${baseUrl}/api/agents/voice/audio/${synthesisResult.audioId}`);
    
    if (!audioResponse.ok) {
      throw new Error(`Audio retrieval failed: ${audioResponse.status}`);
    }
    
    const contentType = audioResponse.headers.get('content-type');
    const contentLength = audioResponse.headers.get('content-length');
    
    console.log(`✅ Audio retrieval successful:`);
    console.log(`   Content-Type: ${contentType}`);
    console.log(`   Content-Length: ${contentLength}`);
    console.log(`   Audio ID: ${synthesisResult.audioId}`);
    
    // Test if we can read the audio data
    const audioBuffer = await audioResponse.buffer();
    console.log(`   Audio buffer size: ${audioBuffer.length} bytes`);
    
    if (audioBuffer.length > 0) {
      console.log('✅ Audio data is valid and readable');
    } else {
      console.log('❌ Audio data is empty');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAudioPlayback(); 