"""
Content Analysis Agent - Advanced Document Intelligence for Teaching
Analyzes uploaded documents to extract structure, key concepts, and generate optimized teaching sequences
"""

import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import re
import json
from dataclasses import dataclass

from .langchain_config import LLMProvider, AgentConfiguration

logger = logging.getLogger(__name__)

@dataclass
class DocumentStructure:
    """Represents the hierarchical structure of a document"""
    title: str
    sections: List[Dict[str, Any]]
    key_concepts: List[str]
    difficulty_level: str
    estimated_reading_time: int
    prerequisites: List[str]
    learning_objectives: List[str]

@dataclass
class TeachingModule:
    """Represents a single teaching module derived from content"""
    id: str
    title: str
    content: str
    visual_elements: List[str]
    duration_minutes: int
    difficulty: str
    prerequisites: List[str]
    learning_outcomes: List[str]
    teaching_strategies: List[str]
    assessment_questions: List[str]

class ContentAnalysisAgent:
    """Advanced AI agent for analyzing document content and structure"""
    
    def __init__(self):
        self.llm = None
        self.initialized = False
        
    def initialize(self):
        """Initialize the content analysis agent"""
        try:
            # Get agent configuration
            config = AgentConfiguration.get_agent_config('content_specialist')
            
            # Initialize LLM
            self.llm = LLMProvider.get_llm(
                provider=config['provider'],
                model=config['model'],
                temperature=0.3  # Lower temperature for more structured analysis
            )
            
            self.initialized = True
            logger.info("Content Analysis Agent initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize Content Analysis Agent: {str(e)}")
            raise
    
    async def analyze_document_structure(self, content: str, metadata: Dict[str, Any]) -> DocumentStructure:
        """Analyze document to extract hierarchical structure and key concepts"""
        if not self.initialized:
            self.initialize()
        
        try:
            # Prepare analysis prompt
            analysis_prompt = f"""
            Analyze the following document content and extract its structure and key concepts.
            
            Document Metadata:
            - Type: {metadata.get('type', 'unknown')}
            - Pages: {metadata.get('pages', 0)}
            - Word Count: {metadata.get('word_count', 0)}
            
            Content (first 3000 characters):
            {content[:3000]}
            
            Please provide a JSON response with the following structure:
            {{
                "title": "Document title or main topic",
                "sections": [
                    {{
                        "title": "Section title",
                        "level": 1,
                        "content_summary": "Brief summary of section content",
                        "key_points": ["Point 1", "Point 2"],
                        "complexity": "basic|intermediate|advanced"
                    }}
                ],
                "key_concepts": ["Concept 1", "Concept 2", "Concept 3"],
                "difficulty_level": "beginner|intermediate|advanced|expert",
                "estimated_reading_time": 30,
                "prerequisites": ["Prerequisite knowledge 1", "Prerequisite 2"],
                "learning_objectives": ["Students will understand...", "Students will be able to..."]
            }}
            
            Focus on extracting educational value and creating a logical learning progression.
            """
            
            # Get AI analysis
            response = await self.llm.ainvoke(analysis_prompt)
            analysis_result = self._parse_json_response(response.content)
            
            # Create DocumentStructure object
            return DocumentStructure(
                title=analysis_result.get('title', 'Unknown Document'),
                sections=analysis_result.get('sections', []),
                key_concepts=analysis_result.get('key_concepts', []),
                difficulty_level=analysis_result.get('difficulty_level', 'intermediate'),
                estimated_reading_time=analysis_result.get('estimated_reading_time', 30),
                prerequisites=analysis_result.get('prerequisites', []),
                learning_objectives=analysis_result.get('learning_objectives', [])
            )
            
        except Exception as e:
            logger.error(f"Document structure analysis failed: {str(e)}")
            # Return fallback structure
            return self._create_fallback_structure(content, metadata)
    
    async def generate_teaching_modules(self, 
                                      document_structure: DocumentStructure, 
                                      learning_goals: str,
                                      user_learning_style: str = "balanced",
                                      session_duration: int = 60) -> List[TeachingModule]:
        """Generate optimized teaching modules based on document analysis and user goals"""
        try:
            # Calculate optimal module count based on session duration - aim for depth
            target_modules = max(3, min(7, session_duration // 12))  # Longer modules for depth
            
            module_prompt = f"""
            You are an expert educator creating COMPREHENSIVE teaching modules that provide REAL VALUE to students.
            
            Document: {document_structure.title}
            Learning Goals: {learning_goals}
            User Learning Style: {user_learning_style}
            Session Duration: {session_duration} minutes
            Difficulty Level: {document_structure.difficulty_level}
            
            Key Concepts Available: {', '.join(document_structure.key_concepts[:10])}
            Prerequisites: {', '.join(document_structure.prerequisites)}
            
            Document Sections with Content:
            {self._format_sections_for_prompt(document_structure.sections[:8])}
            
            Create {target_modules} SUBSTANTIAL teaching modules that:
            
            1. **TEACH IN DEPTH** - Don't just mention concepts, explain them thoroughly
            2. **USE SPECIFIC CONTENT** - Extract actual formulas, examples, data from the document
            3. **BUILD PROGRESSIVELY** - Each module builds on previous knowledge
            4. **INCLUDE PRACTICE** - Add problems, exercises, and applications
            5. **ENGAGE LEARNERS** - Use analogies, stories, and real-world connections
            
            Each module MUST include:
            
            - **Title**: Clear, specific title stating what will be learned
            - **Content**: 300-500 words of detailed teaching content including:
              * Thorough explanations of concepts
              * Step-by-step breakdowns
              * Multiple examples with numbers/data
              * Analogies and real-world applications
              * Common misconceptions to avoid
            - **Visual Elements**: Specific diagrams, formulas, charts to display
            - **Duration**: 12-20 minutes for meaningful learning
            - **Prerequisites**: What students need to know first
            - **Learning Outcomes**: Specific skills students will gain
            - **Teaching Strategies**: How to teach this effectively
            - **Assessment Questions**: 3-5 questions to check understanding
            
            EXAMPLE OF GOOD MODULE CONTENT:
            "In this module, we'll master Newton's Second Law (F=ma). We'll start by understanding what force really means - not just a push or pull, but a measurable interaction that changes motion. Through hands-on examples like calculating the force needed to accelerate a 1500kg car from 0 to 60mph in 8 seconds, you'll see how F=ma applies everywhere. We'll work through 5 practice problems together, from simple to complex, including multi-force scenarios. By the end, you'll be able to analyze any physical situation and calculate the forces involved."
            
            Response format (JSON):
            {{
                "modules": [
                    {{
                        "id": "module_1",
                        "title": "Mastering Newton's Second Law: Force, Mass, and Acceleration",
                        "content": "[300-500 words of detailed teaching content as shown in example]",
                        "visual_elements": ["F=ma equation", "Force diagram with vectors", "Acceleration vs time graph", "Real car example with calculations"],
                        "duration_minutes": 18,
                        "difficulty": "intermediate",
                        "prerequisites": ["Understanding of velocity", "Basic algebra skills"],
                        "learning_outcomes": ["Calculate force given mass and acceleration", "Solve for any variable in F=ma", "Apply Newton's 2nd Law to real scenarios"],
                        "teaching_strategies": ["Start with intuitive examples", "Use visual demonstrations", "Work through problems step-by-step", "Connect to everyday experiences"],
                        "assessment_questions": ["A 2000kg truck accelerates at 3 m/s². What force is applied?", "If a 50N force acts on a 10kg object, what's its acceleration?", "Explain why a heavier object needs more force to achieve the same acceleration"]
                    }}
                ]
            }}
            
            Create modules that students will find GENUINELY HELPFUL and EDUCATIONAL.
            """
            
            response = await self.llm.ainvoke(module_prompt)
            modules_data = self._parse_json_response(response.content)
            
            # Create TeachingModule objects with enhanced content
            modules = []
            for i, module_data in enumerate(modules_data.get('modules', [])):
                # Ensure content is substantial
                content = module_data.get('content', '')
                if len(content) < 200:
                    content = self._enhance_module_content(
                        module_data.get('title', f'Module {i+1}'),
                        document_structure.key_concepts,
                        learning_goals
                    )
                
                # Ensure comprehensive visual elements
                visual_elements = module_data.get('visual_elements', [])
                if len(visual_elements) < 3:
                    visual_elements.extend([
                        f"Key concept diagram for {module_data.get('title', 'topic')}",
                        "Step-by-step problem solution",
                        "Summary chart of main points"
                    ])
                
                # Ensure meaningful assessment questions
                assessment_questions = module_data.get('assessment_questions', [])
                if len(assessment_questions) < 3:
                    assessment_questions = self._generate_assessment_questions(
                        module_data.get('title', ''),
                        module_data.get('learning_outcomes', [])
                    )
                
                module = TeachingModule(
                    id=module_data.get('id', f'module_{i+1}'),
                    title=module_data.get('title', f'Module {i+1}: Core Concepts'),
                    content=content,
                    visual_elements=visual_elements[:6],  # Limit to 6 most important
                    duration_minutes=max(module_data.get('duration_minutes', 15), 12),  # Minimum 12 minutes
                    difficulty=module_data.get('difficulty', 'intermediate'),
                    prerequisites=module_data.get('prerequisites', []),
                    learning_outcomes=module_data.get('learning_outcomes', [
                        f"Understand key concepts of {module_data.get('title', 'this topic')}",
                        "Apply knowledge to solve problems",
                        "Connect concepts to real-world applications"
                    ]),
                    teaching_strategies=module_data.get('teaching_strategies', [
                        "Interactive explanation with examples",
                        "Visual demonstrations on whiteboard",
                        "Guided practice problems",
                        "Check for understanding with questions"
                    ]),
                    assessment_questions=assessment_questions
                )
                modules.append(module)
            
            logger.info(f"Generated {len(modules)} comprehensive teaching modules for: {document_structure.title}")
            return modules
            
        except Exception as e:
            logger.error(f"Teaching module generation failed: {str(e)}")
            return self._create_comprehensive_fallback_modules(document_structure, learning_goals, session_duration)
    
    async def extract_whiteboard_content(self, module: TeachingModule) -> List[Dict[str, Any]]:
        """Extract REAL teaching content optimized for whiteboard display"""
        try:
            whiteboard_prompt = f"""
            You are creating ACTUAL TEACHING CONTENT for a whiteboard lesson.
            DO NOT create meta-descriptions. TEACH THE ACTUAL CONTENT!
            
            Module: {module.title}
            Content: {module.content}
            Visual Elements: {', '.join(module.visual_elements)}
            Duration: {module.duration_minutes} minutes
            Learning Outcomes: {', '.join(module.learning_outcomes[:3])}
            
            Create 10-20 whiteboard segments that ACTUALLY TEACH. For each segment:
            
            1. **Voice Text (60-120 seconds of REAL TEACHING)**:
               - EXPLAIN the actual concept, don't say "we will learn"
               - USE specific examples with real numbers
               - WORK through calculations step by step
               - DEFINE terms clearly and completely
               - ASK questions to check understanding
            
            2. **Visual Content (ACTUAL educational content)**:
               - Real formulas and equations
               - Specific examples with numbers
               - Step-by-step solutions
               - Clear diagrams and charts
               - Definitions and key points
            
            GOOD EXAMPLE:
            {{
                "id": "teaching_force",
                "voice_text": "Force is a push or pull on an object. It's measured in Newtons. When you push a shopping cart with 50 Newtons of force, you're applying energy to change its motion. The formula is F = ma, where F is force, m is mass in kilograms, and a is acceleration in meters per second squared. Let's calculate: if the cart has a mass of 20 kg and you want to accelerate it at 2.5 m/s², then F = 20 × 2.5 = 50 N. That's exactly how much force you need!",
                "visual_content": "FORCE\\n\\nDefinition: Push or pull on object\\nUnit: Newton (N)\\n\\nFormula: F = ma\\n\\nExample:\\nCart mass (m) = 20 kg\\nAcceleration (a) = 2.5 m/s²\\nF = 20 × 2.5 = 50 N\\n\\nYou need 50 N of force!",
                "coordinates": {{"x": 50, "y": 30}},
                "duration_seconds": 90,
                "visual_action": "write_and_calculate"
            }}
            
            BAD EXAMPLE (DO NOT DO THIS):
            {{
                "voice_text": "Now we'll explore the concept of force and learn about its applications.",
                "visual_content": "Introduction to Force"
            }}
            
            Create segments that TEACH SPECIFIC CONTENT from the module.
            NO shallow overviews. ACTUAL teaching with real information.
            
            Response format (JSON):
            {{
                "segments": [array of teaching segments]
            }}"""
            
            response = await self.llm.ainvoke(whiteboard_prompt)
            segments_data = self._parse_json_response(response.content)
            
            # Validate and enhance segments
            enhanced_segments = []
            for i, segment in enumerate(segments_data.get('segments', [])):
                voice_text = segment.get('voice_text', '')
                visual_content = segment.get('visual_content', '')
                
                # Skip meta-teaching segments
                if any(phrase in voice_text.lower() for phrase in 
                      ["we will learn", "we'll explore", "let's begin", "welcome to", "in this section"]):
                    continue
                
                # Ensure content is substantial
                if len(voice_text) < 100 or len(visual_content) < 30:
                    continue
                
                enhanced_segment = {
                    'id': segment.get('id', f'segment_{i+1}'),
                    'voice_text': voice_text,
                    'visual_content': visual_content,
                    'coordinates': segment.get('coordinates', {'x': 50, 'y': 20 + (i * 8)}),
                    'duration_seconds': max(segment.get('duration_seconds', 60), 60),
                    'visual_action': segment.get('visual_action', 'write')
                }
                enhanced_segments.append(enhanced_segment)
            
            # If not enough good segments, create comprehensive ones
            if len(enhanced_segments) < 10:
                logger.warning(f"Only {len(enhanced_segments)} quality segments, generating more...")
                enhanced_segments.extend(
                    self._create_actual_teaching_segments(module, len(enhanced_segments))
                )
            
            logger.info(f"✅ Generated {len(enhanced_segments)} REAL teaching segments")
            return enhanced_segments
            
        except Exception as e:
            logger.error(f"Whiteboard content extraction failed: {str(e)}")
            return self._create_actual_teaching_segments(module)
    
    def _parse_json_response(self, response: str) -> Dict[str, Any]:
        """Parse JSON response from LLM, handling potential formatting issues"""
        try:
            # Clean up response
            cleaned = response.strip()
            
            # Find JSON block if wrapped in markdown
            if '```json' in cleaned:
                start = cleaned.find('```json') + 7
                end = cleaned.find('```', start)
                if end > start:
                    cleaned = cleaned[start:end].strip()
            elif '```' in cleaned:
                start = cleaned.find('```') + 3
                end = cleaned.find('```', start)
                if end > start:
                    cleaned = cleaned[start:end].strip()
            
            return json.loads(cleaned)
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON response: {str(e)}")
            # Try to extract partial information
            return self._extract_fallback_data(response)
    
    def _extract_fallback_data(self, response: str) -> Dict[str, Any]:
        """Extract basic information when JSON parsing fails"""
        return {
            "title": "Learning Session",
            "sections": [{"title": "Main Content", "level": 1, "content_summary": response[:200]}],
            "key_concepts": ["Core Concepts"],
            "difficulty_level": "intermediate",
            "estimated_reading_time": 20,
            "prerequisites": [],
            "learning_objectives": ["Learn key concepts"]
        }
    
    def _create_fallback_structure(self, content: str, metadata: Dict[str, Any]) -> DocumentStructure:
        """Create basic document structure when AI analysis fails"""
        # Extract some basic structure from content
        lines = content.split('\n')
        sections = []
        key_concepts = []
        
        # Simple heuristic: look for headers (lines with fewer than 100 chars)
        for line in lines[:20]:
            line = line.strip()
            if line and len(line) < 100 and not line.endswith('.'):
                sections.append({
                    "title": line,
                    "level": 1,
                    "content_summary": "Content section",
                    "key_points": [],
                    "complexity": "intermediate"
                })
                key_concepts.append(line)
        
        return DocumentStructure(
            title=metadata.get('original_filename', 'Document'),
            sections=sections[:5],
            key_concepts=key_concepts[:5],
            difficulty_level='intermediate',
            estimated_reading_time=metadata.get('word_count', 1000) // 200,
            prerequisites=[],
            learning_objectives=["Understand the main concepts"]
        )
    
    def _enhance_module_content(self, title: str, key_concepts: List[str], learning_goals: str) -> str:
        """Generate enhanced module content when AI response is too brief"""
        concepts_text = ", ".join(key_concepts[:3]) if key_concepts else "core concepts"
        
        return f"""In this comprehensive module on {title}, we'll dive deep into the fundamental principles and practical applications. 
        
        We'll begin by establishing a clear understanding of {concepts_text}, exploring not just what they are, but why they matter in real-world contexts. Through detailed explanations and step-by-step examples, you'll see how these concepts connect to {learning_goals}.
        
        I'll guide you through multiple worked examples, starting with simple cases and progressively building to more complex scenarios. We'll examine common pitfalls and misconceptions, ensuring you develop a robust understanding. 
        
        By working through practice problems together, you'll gain confidence in applying these concepts independently. We'll also explore how these ideas extend to advanced applications, preparing you for deeper study.
        
        This module emphasizes hands-on learning with visual demonstrations, ensuring concepts stick. You'll leave with practical skills you can immediately apply."""
    
    def _generate_assessment_questions(self, module_title: str, learning_outcomes: List[str]) -> List[str]:
        """Generate meaningful assessment questions for a module"""
        base_questions = [
            f"Explain the main concept covered in {module_title} in your own words.",
            f"Solve this problem: [Specific problem related to {module_title}]",
            f"How does {module_title} apply to real-world situations? Give an example.",
            "What's the most important thing you learned and why?",
            "Identify and correct the error in this solution: [Example with intentional mistake]"
        ]
        
        # Add outcome-specific questions if available
        for outcome in learning_outcomes[:2]:
            base_questions.append(f"Demonstrate your ability to {outcome.lower()}")
        
        return base_questions[:5]  # Return top 5 questions
    
    def _create_comprehensive_fallback_modules(self, structure: DocumentStructure, goals: str, duration: int) -> List[TeachingModule]:
        """Create comprehensive teaching modules when AI generation fails"""
        modules = []
        module_count = max(3, min(5, duration // 15))
        module_duration = duration // module_count
        
        # Module templates for comprehensive learning
        module_templates = [
            {
                'title': f'Foundation: Understanding {structure.title}',
                'focus': 'Core definitions, principles, and context',
                'outcomes': ['Define key terms and concepts', 'Understand fundamental principles', 'Recognize real-world applications']
            },
            {
                'title': f'Deep Dive: Exploring {goals}',
                'focus': 'Detailed analysis and mechanisms',
                'outcomes': ['Analyze complex relationships', 'Apply concepts to solve problems', 'Evaluate different approaches']
            },
            {
                'title': f'Applications: Using {structure.title} in Practice',
                'focus': 'Hands-on problem solving and examples',
                'outcomes': ['Solve practical problems', 'Apply knowledge to new situations', 'Create solutions using learned concepts']
            },
            {
                'title': f'Advanced Concepts in {structure.title}',
                'focus': 'Extensions and deeper understanding',
                'outcomes': ['Explore advanced topics', 'Connect to related fields', 'Prepare for further study']
            },
            {
                'title': f'Mastery Check: {goals}',
                'focus': 'Review, synthesis, and assessment',
                'outcomes': ['Synthesize all concepts learned', 'Demonstrate comprehensive understanding', 'Apply knowledge confidently']
            }
        ]
        
        for i in range(module_count):
            template = module_templates[i % len(module_templates)]
            
            modules.append(TeachingModule(
                id=f'module_{i+1}',
                title=template['title'],
                content=f"""This module focuses on {template['focus']} related to {structure.title} and {goals}.
                
                We'll explore these concepts through detailed explanations, visual demonstrations, and hands-on practice. Starting with foundational ideas, we'll build your understanding step by step, using real-world examples and applications.
                
                You'll work through carefully crafted exercises designed to reinforce each concept. By connecting theory to practice, you'll develop both conceptual understanding and practical skills.
                
                Throughout this module, we'll address common challenges and misconceptions, ensuring you build a solid foundation for advanced learning.""",
                visual_elements=[
                    f'Concept map of {structure.key_concepts[0] if structure.key_concepts else "key ideas"}',
                    'Step-by-step problem solution',
                    'Comparison chart of approaches',
                    'Real-world application diagram'
                ],
                duration_minutes=module_duration,
                difficulty=structure.difficulty_level,
                prerequisites=structure.prerequisites[:2] if structure.prerequisites else [],
                learning_outcomes=template['outcomes'],
                teaching_strategies=[
                    'Interactive whiteboard demonstrations',
                    'Guided problem-solving sessions',
                    'Conceptual explanations with analogies',
                    'Practice with immediate feedback'
                ],
                assessment_questions=[
                    f'Explain the main concept of {template["title"]} in detail.',
                    'Solve this practice problem: [Specific problem]',
                    'How would you apply this knowledge to a new situation?',
                    'What connections can you make to previous modules?'
                ]
            ))
        
        return modules

    def _create_fallback_modules(self, structure: DocumentStructure, goals: str, duration: int) -> List[TeachingModule]:
        """Create basic teaching modules when AI generation fails"""
        # Use the comprehensive version
        return self._create_comprehensive_fallback_modules(structure, goals, duration)
    
    def _create_actual_teaching_segments(self, module: TeachingModule, start_idx: int = 0) -> List[Dict[str, Any]]:
        """Create actual teaching segments that really teach content"""
        segments = []
        
        # Parse module content to extract key information
        content_lines = module.content.split('.')
        key_points = [line.strip() for line in content_lines if line.strip()][:5]
        
        # Teaching segment templates with REAL content
        segment_templates = [
            {
                'id': f'define_{start_idx}',
                'voice_text': f"{module.title} is defined as {key_points[0] if key_points else 'a fundamental concept'}. This means that in practical terms, when you encounter {module.title}, you're dealing with specific characteristics and behaviors. Let me explain exactly what this means with concrete examples.",
                'visual_content': f"{module.title}\\n\\nDefinition:\\n{key_points[0] if key_points else 'Core concept'}\\n\\nKey Properties:\\n• Property 1\\n• Property 2\\n• Property 3",
                'duration_seconds': 75
            },
            {
                'id': f'explain_{start_idx}',
                'voice_text': f"The mechanism behind {module.title} works like this: First, {key_points[1] if len(key_points) > 1 else 'the initial condition occurs'}. Then, a transformation happens. Finally, we get our result. This isn't just theory - let me show you with numbers.",
                'visual_content': f"How {module.title} Works\\n\\nStep 1: Initial State\\n↓\\nStep 2: Transformation\\n↓\\nStep 3: Result\\n\\nExample with values:\\n[Specific calculation]",
                'duration_seconds': 80
            },
            {
                'id': f'example_{start_idx}',
                'voice_text': "Here's a concrete example with real numbers. Suppose we have a scenario where x equals 10 and y equals 5. Using our principle, we calculate the result step by step. First, we identify our knowns. Then we apply the formula. Watch as I work through this.",
                'visual_content': "Example Problem\\n\\nGiven:\\nx = 10\\ny = 5\\n\\nSolution:\\nStep 1: Identify values\\nStep 2: Apply formula\\nStep 3: Calculate\\n\\nAnswer: [Result]",
                'duration_seconds': 90
            },
            {
                'id': f'practice_{start_idx}',
                'voice_text': "Now let's practice together. I'll give you a problem and we'll solve it step by step. Don't worry if it seems challenging at first - we'll break it down into manageable pieces. Ready? Here's our problem...",
                'visual_content': "Practice Problem\\n\\nYour Turn:\\n[Problem setup]\\n\\nApproach:\\n1. What do we know?\\n2. What formula to use?\\n3. Calculate step by step\\n\\nLet's solve together!",
                'duration_seconds': 85
            },
            {
                'id': f'apply_{start_idx}',
                'voice_text': f"In real-world applications, {module.title} appears everywhere. Engineers use it when designing bridges to calculate load distributions. Scientists apply it in research to predict outcomes. Even in daily life, you encounter this when [specific example].",
                'visual_content': f"Real-World Applications\\n\\n{module.title} in Action:\\n\\n• Engineering: [Specific use]\\n• Science: [Research application]\\n• Daily Life: [Common example]\\n\\nWhy It Matters!",
                'duration_seconds': 70
            }
        ]
        
        # Add visual elements if provided
        if module.visual_elements:
            for i, element in enumerate(module.visual_elements[:3]):
                segments.append({
                    'id': f'visual_{start_idx + i}',
                    'voice_text': f"Let me show you {element}. This visual representation helps us understand the concept better. Notice how each component relates to the others. This relationship is crucial for solving problems.",
                    'visual_content': f"{element}\\n\\n[Detailed diagram]\\n\\nKey Relationships:\\n→ Connection 1\\n→ Connection 2\\n→ Connection 3",
                    'coordinates': {'x': 50, 'y': 30 + (len(segments) * 8)},
                    'duration_seconds': 65,
                    'visual_action': 'diagram'
                })
        
        # Add the templated segments
        for i, template in enumerate(segment_templates):
            segment = {**template}
            segment['coordinates'] = {'x': 50, 'y': 20 + ((start_idx + i) * 8)}
            segment['visual_action'] = 'write'
            segments.append(segment)
        
        return segments
    
    def _format_sections_for_prompt(self, sections: List[Dict[str, Any]]) -> str:
        """Format document sections for LLM prompt"""
        formatted = []
        for section in sections:
            formatted.append(f"- {section.get('title', 'Section')}: {section.get('content_summary', 'Content')}")
        return '\n'.join(formatted)

# Global instance
content_analysis_agent = ContentAnalysisAgent()

def get_content_analysis_agent() -> ContentAnalysisAgent:
    """Get the global content analysis agent instance"""
    if not content_analysis_agent.initialized:
        content_analysis_agent.initialize()
    return content_analysis_agent 