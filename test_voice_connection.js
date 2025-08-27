const fetch = require('node-fetch');

async function testVoiceService() {
    try {
        console.log('🔍 Testing voice synthesis service connection...');
        
        // Test health endpoint
        const healthResponse = await fetch('http://localhost:8005/health', {
            method: 'GET',
            timeout: 5000
        });
        
        if (healthResponse.ok) {
            const healthData = await healthResponse.json();
            console.log('✅ Voice synthesis service is running!');
            console.log('📊 Health data:', JSON.stringify(healthData, null, 2));
        } else {
            console.log('❌ Voice synthesis service health check failed:', healthResponse.status);
        }
        
        // Test providers status
        const providersResponse = await fetch('http://localhost:8005/providers/status', {
            method: 'GET',
            timeout: 5000
        });
        
        if (providersResponse.ok) {
            const providersData = await providersResponse.json();
            console.log('🎙️ Provider status:', JSON.stringify(providersData, null, 2));
        } else {
            console.log('❌ Provider status check failed:', providersResponse.status);
        }
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        console.log('💡 Make sure the voice synthesis service is running on port 8005');
    }
}

testVoiceService(); 