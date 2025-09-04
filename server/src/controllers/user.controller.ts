import { Controller, Get, Put, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { UserService } from '../services/user.service';

@ApiTags('Users')
@Controller('api/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('customize')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Customize Lucid preferences' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Current customization values returned' })
  async getCustomize(@CurrentUser() user: any) {
    return this.userService.getCustomizePreferences(user.id);
  }

  @Put('customize')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update Customize Lucid preferences' })
  @ApiBearerAuth()
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        displayName: { type: 'string', maxLength: 150 },
        occupation: { type: 'string', maxLength: 150 },
        traits: { type: 'string', maxLength: 500, description: 'Comma-separated or free text' },
        extraNotes: { type: 'string' },
        preferredLanguage: { type: 'string', description: 'Human readable, e.g., "English"' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Customization updated successfully' })
  async updateCustomize(
    @CurrentUser() user: any,
    @Body()
    updates: {
      displayName?: string;
      occupation?: string;
      traits?: string;
      extraNotes?: string;
      preferredLanguage?: string;
    },
  ) {
    return this.userService.updateCustomizePreferences(user.id, updates);
  }
}


