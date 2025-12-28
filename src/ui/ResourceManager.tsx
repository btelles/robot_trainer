import React, { useEffect, useState } from "react";
import { Button } from "./Button";
import Card from "./Card";
import useUIStore from "../lib/uiStore";

type Field = { name: string; label: string; type?: "text" | "number" };

type Props = {
  title: string;
  resourceKey: string; // config key where resources are stored, e.g. 'resources.robots'
  fields: Field[];
  renderForm?: (opts: {
    onCancel: () => void;
    onSaved: (item: any) => void;
  }) => React.ReactNode;
};

const emptyFromFields = (fields: Field[]) => {
  const o: any = {};
  for (const f of fields) o[f.name] = f.type === "number" ? 0 : "";
  return o;
};

export const ResourceManager: React.FC<Props> = ({
  title,
  resourceKey,
  fields,
  renderForm,
}) => {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(emptyFromFields(fields));
  const showForm = useUIStore((s: any) => s.resourceManagerShowForm);
  const setShowForm = useUIStore((s: any) => s.setResourceManagerShowForm);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await (window as any).electronAPI.getConfig(resourceKey);
      setItems(Array.isArray(res) ? res : []);
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // try to listen to external changes if api provides it
    try {
      (window as any).electronAPI?.onConfigChanged?.((k: string) => {
        if (k === resourceKey) load();
      });
    } catch {}
  }, [resourceKey]);

  const saveAll = async (next: any[]) => {
    await (window as any).electronAPI.setConfig(resourceKey, next);
    setItems(next);
  };

  const onCreate = () => {
    setForm(emptyFromFields(fields));
    setEditing(null);
    setShowForm(true);
  };

  const onEdit = (it: any) => {
    setEditing(it);
    setForm({ ...it });
  };

  const onSave = async () => {
    if (editing) {
      const next = items.map((i) =>
        i.id === editing.id ? { ...i, ...form } : i
      );
      await saveAll(next);
      setEditing(null);
    } else {
      const id = Date.now().toString();
      const next = [...items, { id, ...form }];
      await saveAll(next);
    }
    setForm(emptyFromFields(fields));
    setShowForm(false);
  };

  const onDelete = async (id: string) => {
    const next = items.filter((i) => i.id !== id);
    await saveAll(next);
  };

  return (
    <div>
      {!showForm && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <Button onClick={onCreate} variant="primary" pulse={items.length === 0}>
              Add {title.replace(/s$/, "")}
            </Button>
          </div>
          {loading ? (
            <div>Loading…</div>
          ) : (
            <div className="space-y-3 ">
              {items.length === 0 && (
                <div className="">
                  <div className="text-sm text-gray-500">
                    No {title.toLowerCase()} defined
                  </div>
                    <Button onClick={() => { setShowForm(true); }} className=" card w-sm h-48 m-auto p-auto my-8 justify-around items-center text-center border rounded-xl border-transparent flex">
                    <span>Add a {title.replace(/s$/, "")}</span>
                  </Button>
                </div>
              )}
              {items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div>
                    <div className="font-medium">{it.name || "(unnamed)"}</div>
                    <div className="text-sm text-gray-500">
                      {it.serialNumber || ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowForm(true);
                        onEdit(it);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => onDelete(it.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showForm && (
        <div className="mt-4">
          {/* custom form overrides default */}
          {typeof renderForm === "function" && !editing ? (
            renderForm({
              onCancel: () => {
                setShowForm(false);
                setEditing(null);
              },
              onSaved: async (item: any) => {
                await onSave();
              },
            })
          ) : (
            <>
              <h3 className="font-medium">
                {editing ? "Edit" : "Create"} {title.replace(/s$/, "")}
              </h3>

              <div className="grid grid-cols-2 gap-3">
                {fields.map((f) => (
                  <label
                    key={f.name}
                    className="flex flex-col text-sm border border-transparent hover:border-gray-200 rounded px-2 py-1 transition-colors"
                  >
                    <span className="text-gray-600 mb-1">{f.label}</span>
                    <input
                      value={form[f.name] ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          [f.name]:
                            f.type === "number"
                              ? Number(e.target.value)
                              : e.target.value,
                        })
                      }
                      className="w-full outline-none"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button onClick={onSave}>{editing ? "Save" : "Create"}</Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setForm(emptyFromFields(fields));
                    setEditing(null);
                    setShowForm(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ResourceManager;
