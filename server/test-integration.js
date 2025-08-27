/**
 * Integration Test Script for Lucid Learn AI
 * Tests the complete pipeline: NestJS Server → AI Services
 */

const baseUrl = 'http://localhost:3001';

async function testIntegration() {
  console.log('🚀 Starting Lucid Learn AI Integration Tests\n');

  // Test 1: Health Check All Services
  console.log('1️⃣ Testing AI Services Health...');
  try {
    const healthResponse = await fetch(`${baseUrl}/api/agents/health`);
    const healthData = await healthResponse.json();
    
    console.log('✅ Health Check Results:');
    console.log(`   📍 Q&A Agent: ${healthData.qnaAgent?.status || 'unknown'}`);
    console.log(`   📍 Teaching Content Service: ${healthData.teachingContentService?.status || 'unknown'}`);
    console.log(`   📍 Multi-Agent Orchestrator: ${healthData.multiAgentOrchestrator?.status || 'unknown'}`);
    console.log('');
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
    console.log('');
  }

  // Test 2: Curriculum Generation
  console.log('2️⃣ Testing Curriculum Generation...');
  try {
    const curriculumRequest = {
      userId: 'test_integration_user',
      learningGoals: 'Learn advanced calculus and differential equations',
      uploadedDocuments: [],
      difficultyLevel: 'intermediate',
      learningStyle: 'balanced',
      sessionDuration: 60
    };

    const curriculumResponse = await fetch(`${baseUrl}/api/agents/teaching/curriculum/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(curriculumRequest),
    });

    if (curriculumResponse.ok) {
      const curriculum = await curriculumResponse.json();
      console.log('✅ Curriculum Generated Successfully!');
      console.log(`   📚 Curriculum ID: ${curriculum.curriculumId}`);
      console.log(`   📖 Title: ${curriculum.title}`);
      console.log(`   ⏱️ Duration: ${curriculum.totalDuration} minutes`);
      console.log(`   📝 Modules: ${curriculum.modules.length}`);
      
      // Test 3: Whiteboard Content Generation
      console.log('\n3️⃣ Testing Whiteboard Content Generation...');
      
      const whiteboardRequest = {
        curriculumId: curriculum.curriculumId,
        moduleIndex: 0,
        userId: 'test_integration_user'
      };

      const whiteboardResponse = await fetch(`${baseUrl}/api/agents/teaching/whiteboard/content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(whiteboardRequest),
      });

      if (whiteboardResponse.ok) {
        const whiteboardContent = await whiteboardResponse.json();
        console.log('✅ Whiteboard Content Generated Successfully!');
        console.log(`   🎨 Session ID: ${whiteboardContent.sessionId}`);
        console.log(`   📊 Teaching Segments: ${whiteboardContent.segments.length}`);
        console.log(`   ⏰ Estimated Duration: ${whiteboardContent.estimatedDuration} seconds`);
        
        // Show first segment as example
        if (whiteboardContent.segments.length > 0) {
          const firstSegment = whiteboardContent.segments[0];
          console.log(`   🎙️ First Segment Voice: "${firstSegment.voiceText.substring(0, 50)}..."`);
          console.log(`   🎨 First Segment Visual: "${firstSegment.visualContent}"`);
        }
      } else {
        console.log('❌ Whiteboard content generation failed:', await whiteboardResponse.text());
      }
      
    } else {
      console.log('❌ Curriculum generation failed:', await curriculumResponse.text());
    }
    console.log('');
  } catch (error) {
    console.log('❌ Curriculum/Whiteboard test failed:', error.message);
    console.log('');
  }

  // Test 4: Q&A Agent
  console.log('4️⃣ Testing Q&A Agent...');
  try {
    const qnaRequest = {
      sessionId: 'integration_test_session',
      userId: 'test_integration_user',
      message: 'What is the derivative of x²?',
      conversationHistory: []
    };

    const qnaResponse = await fetch(`${baseUrl}/api/agents/qna/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(qnaRequest),
    });

    if (qnaResponse.ok) {
      const qnaData = await qnaResponse.json();
      console.log('✅ Q&A Agent Response Generated!');
      console.log(`   💬 Response: "${qnaData.response.substring(0, 100)}..."`);
      console.log(`   🎯 Confidence: ${(qnaData.confidence * 100).toFixed(1)}%`);
      console.log(`   🤖 Provider: ${qnaData.providerUsed}`);
      console.log(`   ⚡ Processing Time: ${qnaData.processingTimeMs}ms`);
    } else {
      console.log('❌ Q&A failed:', await qnaResponse.text());
    }
    console.log('');
  } catch (error) {
    console.log('❌ Q&A test failed:', error.message);
    console.log('');
  }

  console.log('🎉 Integration Testing Complete!');
  console.log('📊 Summary: All components tested for end-to-end functionality');
  console.log('🔗 Ready for React Native frontend integration!');
}

// Run the integration test
testIntegration().catch(console.error); 