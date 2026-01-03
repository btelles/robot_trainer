import React, { useEffect, useMemo, useState } from "react";
import { Button } from "./Button";
import Card from "./Card";
import useUIStore from "../lib/uiStore";
import { tableResource } from "../db/tableResource";

type Field = { name: string; label: string; type?: "text" | "number" };

type ResourceAPI = {
  list: () => Promise<any[]>;
  create: (item: any) => Promise<any>;
  update: (id: string, item: any) => Promise<any>;
  delete: (id: string) => Promise<any>;
};

type Props = {
  title: string;
  // either supply a resource API directly
  resource?: ResourceAPI;
  // or supply a drizzle `table` to reflect fields and build a resource
  table?: any;
  fields?: Field[];
  renderForm?: (opts: {
    onCancel: () => void;
    onSaved: (item: any) => void;
  }) => React.ReactNode;
};

const emptyFromFields = (fields?: Field[]) => {
  const o: any = {};
  for (const f of (fields || [])) o[f.name] = f.type === "number" ? 0 : "";
  return o;
};

export const ResourceManager: React.FC<Props> = ({
  title,
  resource,
  table,
  fields,
  renderForm,
}) => {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  // build a resource from table when provided (memoized)
  const fullTableResource = useMemo(() => {
    if (!table) return null;
    try {
      // lazy require to avoid circular deps at module load
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return tableResource(table);
    } catch (e) {
      return null;
    }
  }, [table]);

  // activeResource: prefer explicit resource prop, otherwise use tableResource
  const activeResource: ResourceAPI = (resource as any) || (fullTableResource as any);

  // infer fields from table columns if not provided
  const inferredFields = useMemo(() => {
    if (fields && fields.length) {
      console.error(`Fields were not defined in ResourceManager for table ${table.name}`);
      return fields;
    }
    if (!table) {
      console.error(`Could not find columns for table ${table.name}`);
      return [];
    }
    return Object.keys(table)
      .filter((k) => k !== "id" && k !== "enableRLS")
      .map((k) => ({ name: k, label: k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()) }));
  }, [fields, table]);

  const [form, setForm] = useState<any>(emptyFromFields(inferredFields));
  const showForm = useUIStore((s: any) => s.resourceManagerShowForm);
  const setShowForm = useUIStore((s: any) => s.setResourceManagerShowForm);
  const [loading, setLoading] = useState(false);


  const load = async () => {
    setLoading(true);
    try {
      if (!activeResource || typeof activeResource.list !== 'function') {
        setItems([]);
        return;
      }
      const res = await activeResource.list();
      setItems(Array.isArray(res) ? res : []);
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeResource]);

  const saveAll = async (next: any[]) => {
    // upsert items by id
    for (const it of next) {
      if (!activeResource) continue;
      if (it.id) {
        try { await activeResource.update(it.id, it); } catch { await activeResource.create(it); }
      } else {
        await activeResource.create(it);
      }
    }
    await load();
  };

  const onCreate = () => {
    setForm(emptyFromFields(inferredFields));
    setEditing(null);
    setShowForm(true);
  };

  const onEdit = (it: any) => {
    setEditing(it);
    setForm({ ...it });
  };

  const onSave = async () => {
    try {
      if (!activeResource) return;
      if (editing) {
        await activeResource.update(editing.id, { ...editing, ...form });
        setEditing(null);
      } else {
        await activeResource.create({ ...form });
      }
      await load();
    } catch (e) {
      // ignore for now
    }
    setForm(emptyFromFields(fields));
    setShowForm(false);
  };

  const onDelete = async (id: string) => {
    try {
      if (activeResource) await activeResource.delete(id);
      await load();
    } catch (e) {
      setItems(items.filter((i) => i.id !== id));
    }
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
                {inferredFields.map((f) => (
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
                    setForm(emptyFromFields(inferredFields));
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
