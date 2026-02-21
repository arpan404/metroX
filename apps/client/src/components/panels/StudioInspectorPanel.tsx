import type { Node } from 'reactflow'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import type { StudioNodeData } from '@/components/canvas/StudioNodes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'

export function StudioInspectorPanel({
  selectedNode,
  onUpdateNode,
  workflowJson,
}: {
  selectedNode: Node<StudioNodeData> | null
  onUpdateNode: (patch: Partial<StudioNodeData>) => void
  workflowJson: string
}) {
  if (!selectedNode) {
    return (
      <ScrollArea className="h-full">
        <div className="px-4 pt-5 pb-6 space-y-4">
          <h3 className="text-sm font-semibold">Workflow Inspector</h3>
          <p className="text-xs text-muted-foreground">Select a workflow node to configure it.</p>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </ScrollArea>
    )
  }

  const d = selectedNode.data

  return (
    <ScrollArea className="h-full">
      <div className="px-4 pt-5 pb-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Workflow Inspector</h3>
          <p className="text-xs text-muted-foreground">Editing &ldquo;{d.label}&rdquo;</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Label</Label>
            <Input
              value={d.label}
              onChange={(e) => onUpdateNode({ label: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Role</Label>
            <Input
              value={d.role}
              onChange={(e) => onUpdateNode({ role: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Model</Label>
            <Input
              value={d.model}
              onChange={(e) => onUpdateNode({ model: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={d.description}
              onChange={(e) => onUpdateNode({ description: e.target.value })}
              rows={3}
              className="text-xs"
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">Workflow JSON</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => {
                    navigator.clipboard.writeText(workflowJson)
                    toast.success('Copied to clipboard')
                  }}
                >
                  <Copy className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Copy JSON</TooltipContent>
            </Tooltip>
          </div>
          <pre className="rounded-md border bg-muted/30 p-3 text-[10px] font-mono overflow-x-auto max-h-60 overflow-y-auto">
            {workflowJson}
          </pre>
        </div>
      </div>
    </ScrollArea>
  )
}
