import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class FolderService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createFolderDto: CreateFolderDto) {
    return this.prisma.folder.create({
      data: createFolderDto,
    });
  }

  async findAll(parentId?: string) {
    if (parentId) {
      return this.prisma.folder.findMany({
        where: { parentId },
        include: { _count: { select: { children: true, tasks: true } } },
      });
    }
    return this.prisma.folder.findMany({
      where: { parentId: null },
      include: { _count: { select: { children: true, tasks: true } } },
    });
  }

  async findOne(id: string) {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
      include: {
        children: {
          include: { _count: { select: { children: true, tasks: true } } }
        },
        tasks: true,
      },
    });
    if (!folder) throw new NotFoundException('Folder not found');
    const ancestors: { id: string; name: string }[] = [];
    let currentId = folder.parentId;
    while (currentId) {
      const parent = await this.prisma.folder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      });
      if (!parent) break;
      ancestors.unshift({ id: parent.id, name: parent.name });
      currentId = parent.parentId;
    }

    return { ...folder, ancestors };
  }

  async update(id: string, updateFolderDto: UpdateFolderDto) {
    return this.prisma.folder.update({
      where: { id },
      data: updateFolderDto,
    });
  }

  async remove(id: string) {
    return this.prisma.folder.delete({
      where: { id },
    });
  }
}
