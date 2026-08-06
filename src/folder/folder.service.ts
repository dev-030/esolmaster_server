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
    return this.prisma.folder.findMany({
      where: { parentId: parentId ?? null },
      include: { _count: { select: { children: true, tasks: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
      include: {
        children: {
          include: { _count: { select: { children: true, tasks: true } } },
          orderBy: { createdAt: 'asc' },
        },
        tasks: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!folder) throw new NotFoundException('Folder not found');

    // Resolve the full ancestor chain in ONE raw SQL query using a recursive CTE
    // instead of firing N separate DB round-trips in a while-loop.
    const ancestors: { id: string; name: string }[] = [];
    if (folder.parentId) {
      const rows = await this.prisma.$queryRaw<{ id: string; name: string; depth: number }[]>`
        WITH RECURSIVE ancestor_chain AS (
          SELECT id, name, "parentId", 1 AS depth
          FROM "Folder"
          WHERE id = ${folder.parentId}::uuid
          UNION ALL
          SELECT f.id, f.name, f."parentId", ac.depth + 1
          FROM "Folder" f
          INNER JOIN ancestor_chain ac ON f.id = ac."parentId"
        )
        SELECT id, name, depth FROM ancestor_chain ORDER BY depth DESC
      `;
      ancestors.push(...rows.map(r => ({ id: r.id, name: r.name })));
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
