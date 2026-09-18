import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { FolderService } from './folder.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorator/role.decorator';

@Controller('folder')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class FolderController {
  constructor(private readonly folderService: FolderService) {}

  @Post()
  @Roles(['admin'])
  create(@Body() createFolderDto: CreateFolderDto) {
    return this.folderService.create(createFolderDto);
  }

  @Get()
  findAll(@Query('parentId') parentId?: string) {
    return this.folderService.findAll(parentId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.folderService.findOne(id);
  }

  @Patch(':id')
  @Roles(['admin'])
  update(@Param('id') id: string, @Body() updateFolderDto: UpdateFolderDto) {
    return this.folderService.update(id, updateFolderDto);
  }

  @Delete(':id')
  @Roles(['admin'])
  remove(@Param('id') id: string) {
    return this.folderService.remove(id);
  }
}
