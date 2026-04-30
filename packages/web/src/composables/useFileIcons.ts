import {
	BookOpen,
	CheckSquare,
	File,
	FileAudio,
	FileCode2,
	FileImage,
	FileText,
	FileVideo,
	Folder,
	FolderOpen,
} from "lucide-vue-next";
import type { Component } from "vue";

const extensionIconMap: Record<string, Component> = {
	".md": FileText,
	".markdown": FileText,
	".canvas": BookOpen,
	".base": CheckSquare,
	".png": FileImage,
	".jpg": FileImage,
	".jpeg": FileImage,
	".gif": FileImage,
	".svg": FileImage,
	".webp": FileImage,
	".ico": FileImage,
	".bmp": FileImage,
	".mp4": FileVideo,
	".mov": FileVideo,
	".avi": FileVideo,
	".mkv": FileVideo,
	".mp3": FileAudio,
	".wav": FileAudio,
	".ogg": FileAudio,
	".flac": FileAudio,
	".ts": FileCode2,
	".tsx": FileCode2,
	".js": FileCode2,
	".jsx": FileCode2,
	".vue": FileCode2,
	".py": FileCode2,
	".rs": FileCode2,
	".go": FileCode2,
	".java": FileCode2,
	".c": FileCode2,
	".cpp": FileCode2,
	".h": FileCode2,
	".css": FileCode2,
	".scss": FileCode2,
	".html": FileCode2,
	".json": FileCode2,
	".yaml": FileCode2,
	".yml": FileCode2,
	".toml": FileCode2,
	".sh": FileCode2,
	".sql": FileCode2,
};

export const fileIconByExtension = (ext: string): Component => {
	return extensionIconMap[ext.toLowerCase()] ?? File;
};

export const folderIcon = (expanded: boolean): Component => {
	return expanded ? FolderOpen : Folder;
};
