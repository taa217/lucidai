import { IsEmail, IsString, MinLength, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'password123', description: 'Password confirmation' })
  @IsString()
  @MinLength(6)
  confirmPassword: string;

  @ApiProperty({ 
    example: '1990-01-15', 
    description: 'User birthday in YYYY-MM-DD format',
    required: false 
  })
  @IsOptional()
  @IsDateString()
  birthday?: string;

  @ApiProperty({ 
    example: 'Studying for school or university', 
    description: 'Primary purpose for using Lucid',
    required: false 
  })
  @IsOptional()
  @IsString()
  usagePurpose?: string;

  @ApiProperty({ 
    example: 'University student', 
    description: 'User type/category',
    required: false 
  })
  @IsOptional()
  @IsString()
  userType?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ description: 'New password' })
  @IsString()
  @MinLength(6)
  newPassword: string;

  @ApiProperty({ description: 'New password confirmation' })
  @IsString()
  @MinLength(6)
  confirmNewPassword: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Reset token' })
  @IsString()
  token: string;

  @ApiProperty({ description: 'New password' })
  @IsString()
  @MinLength(6)
  newPassword: string;

  @ApiProperty({ description: 'New password confirmation' })
  @IsString()
  @MinLength(6)
  confirmNewPassword: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'Access token' })
  accessToken: string;

  @ApiProperty({ description: 'Refresh token' })
  refreshToken: string;

  @ApiProperty({ description: 'User information' })
  user: {
    id: string;
    email: string;
    fullName: string;
    birthday?: Date;
    usagePurpose?: string;
    userType?: string;
    createdAt: Date;
  };
} 