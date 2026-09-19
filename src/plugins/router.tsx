import { createBrowserRouter, redirect } from 'react-router'

import BaseLayout from '@/layouts/base-layout'
import AboutPage from '@/pages/about-page'
import HomePage from '@/pages/home-page'
import NotFoundPage from '@/pages/not-found-page'
import ToolPage from '@/pages/tool-page'
import { tools } from '@/tools'
import { RouteError } from '@/plugins/route-error'

/**
 * 路由注册中心：工具路由由 tools 注册表自动生成（注册表即路由表），
 * 工具对象携带 meta（标题/关键词）用于 SEO 与侧栏高亮。
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <BaseLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: <AboutPage /> },
      ...tools.map((tool) => ({
        path: tool.path.replace(/^\//, ''),
        // key 强制切换工具时重挂载：共享的 ToolPage 位置不变，react-i18next 的
        // useTranslation 快照缓存不含 ns，跨分类导航会拿到绑定旧命名空间的过期 t
        element: <ToolPage key={tool.path} tool={tool} />,
      })),
      ...tools.flatMap((tool) =>
        (tool.redirectFrom ?? []).map((from) => ({
          path: from.replace(/^\//, ''),
          loader: () => redirect(tool.path),
        })),
      ),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
