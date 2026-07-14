import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/decorator/role.decorator';
import { RolesGuard } from 'src/guards/role.guard';
import { CriteriaService } from './criteria.service';
import {
  CreateCriterionDto,
  UpdateCriterionDto,
  CriteriaQueryDto,
} from './dto/criteria.dto';

@Controller('criteria')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CriteriaController {
  constructor(private readonly criteriaService: CriteriaService) {}

  @Post()
  @Roles(['admin'])
  async create(@Body() createCriterionDto: CreateCriterionDto) {
    return this.criteriaService.create(createCriterionDto);
  }

  @Get()
  @Roles(['admin', 'teacher'])
  async findAll(@Query() query: CriteriaQueryDto) {
    return this.criteriaService.findAll(query);
  }

  @Get(':id')
  @Roles(['admin', 'teacher'])
  async findOne(@Param('id') id: string) {
    return this.criteriaService.findOne(id);
  }

  @Patch(':id')
  @Roles(['admin', 'teacher'])
  async update(
    @Param('id') id: string,
    @Body() updateCriterionDto: UpdateCriterionDto,
  ) {
    return this.criteriaService.update(id, updateCriterionDto);
  }

  @Delete(':id')
  @Roles(['admin'])
  @HttpCode(204)
  async delete(@Param('id') id: string) {
    return this.criteriaService.delete(id);
  }
}
