import fs from "fs";
import matter from "gray-matter";
import path from "path";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

type Metadata = {
  title: string;
  publishedAt: string;
  summary: string;
  image?: string;
};

function getBlogFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getBlogFiles(filePath));
    } else {
      const ext = path.extname(file);
      if (ext === ".mdx" || ext === ".md") {
        results.push(filePath);
      }
    }
  });
  return results;
}

export async function markdownToHTML(markdown: string) {
  const p = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypePrettyCode, {
      // https://rehype-pretty.pages.dev/#usage
      theme: {
        light: "min-light",
        dark: "min-dark",
      },
      keepBackground: false,
    })
    .use(rehypeStringify)
    .process(markdown);

  return p.toString();
}

export async function getPost(slug: string) {
  const contentDir = path.join(process.cwd(), "content");
  let filePath = path.join(contentDir, `${slug}.mdx`);
  let isMDX = true;
  if (!fs.existsSync(filePath)) {
    filePath = path.join(contentDir, `${slug}.md`);
    isMDX = false;
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  let source = fs.readFileSync(filePath, "utf-8");
  const { content: rawContent, data: metadata } = matter(source);
  
  // Extract title if missing
  if (!metadata.title) {
    const h1Match = rawContent.match(/^#\s+(.*)$/m);
    metadata.title = h1Match ? h1Match[1] : path.basename(slug);
  }

  // Extract publishedAt if missing
  if (!metadata.publishedAt) {
    const stats = fs.statSync(filePath);
    metadata.publishedAt = stats.mtime.toISOString().split("T")[0];
  }

  // Extract summary if missing
  if (!metadata.summary) {
    metadata.summary = rawContent
      .replace(/^#\s+.*$/gm, "") // remove h1
      .replace(/!\[.*\]\(.*\)/g, "") // remove images
      .replace(/\[.*\]\(.*\)/g, "") // remove links
      .replace(/[#*`]/g, "") // remove markdown syntax
      .trim()
      .substring(0, 160) + "...";
  }

  const content = await markdownToHTML(rawContent);
  return {
    source: content,
    metadata: metadata as Metadata,
    slug,
  };
}

async function getAllPosts(dir: string) {
  let blogFiles = getBlogFiles(dir);
  const posts = await Promise.all(
    blogFiles.map(async (fullPath) => {
      const relativePath = path.relative(dir, fullPath);
      const slug = relativePath.replace(/\.mdx?$/, "");
      let post = await getPost(slug);
      if (!post) return null;
      return {
        metadata: post.metadata,
        slug: post.slug,
        source: post.source,
      };
    })
  );
  return posts.filter((post) => post !== null) as {
    metadata: Metadata;
    slug: string;
    source: string;
  }[];
}

export async function getBlogPosts() {
  return getAllPosts(path.join(process.cwd(), "content"));
}
