import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SlidesPipelineService {
  async generateSlides(user_query: string, learning_goal: string) {
    const response = await axios.post('http://localhost:8000/generate_slides', {
      user_query,
      learning_goal,
    });
    return response.data;
  }
} 