import { IsNotEmpty, IsString } from 'class-validator';

export class StartAttemptDto {
  @IsString()
  @IsNotEmpty()
  scheduledTaskId!: string;
}

export class SubmitAnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  @IsNotEmpty()
  answerData!: any; // Can be string, number, or object depending on question type
}