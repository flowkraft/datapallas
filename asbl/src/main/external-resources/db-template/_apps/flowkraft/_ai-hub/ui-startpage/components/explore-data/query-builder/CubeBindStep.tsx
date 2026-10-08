"use client";

import type { CubeParamBinding } from "@/lib/stores/canvas-store";
import { bindableParams, paramRefOf, type BindableParam } from "@/lib/explore-data/sql-builder";
import { bindingTakesTwoEnds, cubeBindableOpsFor } from "@/lib/explore-data/filter-operators";
import { DEFAULT_BINDING_OPERATOR, type CubeBindableMember } from "@/lib/explore-data/cube-selection";

/**
 * The cube's side of the Filter step's bind chip: which member of this cube a dashboard filter
 * narrows.
 *
 * A table query binds a parameter inside a filter, because a filter is where its value goes. A
 * cube widget has no value to replace - the question is a tree of ticks - so the author says the
 * other half instead: the dashboard's `country` narrows the cube's `Country`. The export turns
 * that into the `${country}` the published SQL carries, and a viewer picking a country moves
 * every tile built this way.
 *
 * A cube declares no parameters (R1). The names offered here are the dashboard's own, from its
 * parameters spec, and the `dp_` names the server sets for whoever is looking - the same two
 * groups, from the same helper, as the table chip's dropdown.
 */
interface CubeBindStepProps {
  /** The members a binding can narrow: this cube's dimensions and its measures, in the order its
   *  file writes them. A measure's filter is a HAVING (owner, 2026-09-28). */
  members: CubeBindableMember[];
  bindings: CubeParamBinding[];
  /** The change is handed over as an edit of the list as it is when the edit is applied, not of
   *  the list this render drew: two changes made before the next render each start from the one
   *  before it. */
  onChange: (edit: (current: CubeParamBinding[]) => CubeParamBinding[]) => void;
  /** The dashboard's own parameter ids, from `parametersConfig`. */
  availableParams?: string[];
  /** The `dp_` names the server says it sets for this caller (R9). */
  builtinParams?: string[];
}

export function CubeBindStep({
  members, bindings, onChange, availableParams = [], builtinParams = [],
}: CubeBindStepProps) {

  const offers = bindableParams(availableParams, builtinParams);

  /** What the cube says this member is, so the operators offered are the ones it can answer. */
  const memberNamed = (name: string) => members.find((member) => member.name === name);

  const operatorsFor = (name: string) => {
    const member = memberNamed(name);
    return cubeBindableOpsFor(member?.type, !!member?.measure);
  };

  /** What one offer reads as, so a builtin never reads as a dashboard filter. */
  const offerTitle = (offer: BindableParam) =>
    offer.fromServer
      ? `${paramRefOf(offer.id)} — set by the server for whoever is looking`
      : `The dashboard filter ${paramRefOf(offer.id)}`;

  const addBinding = () => {
    const member = members[0]?.name ?? "";
    const offered = operatorsFor(member).map((operator) => operator.value);
    onChange((current) => [...current, {
      param: offers[0]?.id ?? "",
      member,
      // A member that cannot be listed starts on the first operator it can be asked with,
      // rather than on an `in` it would be refused for.
      operator: offered.includes(DEFAULT_BINDING_OPERATOR)
        ? DEFAULT_BINDING_OPERATOR
        : (offered[0] ?? DEFAULT_BINDING_OPERATOR),
    }]);
  };

  const updateBinding = (
    i: number,
    patch: Partial<CubeParamBinding> | ((binding: CubeParamBinding) => Partial<CubeParamBinding>),
  ) => {
    onChange((current) => current.map((binding, index) => (index === i
      ? { ...binding, ...(typeof patch === "function" ? patch(binding) : patch) }
      : binding)));
  };

  /** Moving to another member can leave the operator behind: a date cannot be listed, and a
   *  string cannot be compared. The binding follows the member rather than staying unaskable. */
  const changeMember = (i: number, member: string) => {
    const offered = operatorsFor(member).map((operator) => operator.value);
    updateBinding(i, (binding) => {
      const current = binding.operator ?? DEFAULT_BINDING_OPERATOR;
      const operator = offered.includes(current) ? current : (offered[0] ?? current);
      return {
        member,
        operator,
        paramTo: bindingTakesTwoEnds(operator) ? binding.paramTo : undefined,
      };
    });
  };

  /** `between` takes a second parameter; every other operator takes none, and forgets it. */
  const changeOperator = (i: number, operator: string) => {
    updateBinding(i, (binding) => ({
      operator,
      paramTo: bindingTakesTwoEnds(operator)
        ? (binding.paramTo || offers[0]?.id || "")
        : undefined,
    }));
  };

  const removeBinding = (i: number) => {
    onChange((current) => current.filter((_, index) => index !== i));
  };

  // Nothing to bind to and nothing bound yet: a canvas with no parameters says nothing about
  // dashboard filters, exactly as the table chip shows no control there.
  if (offers.length === 0 && bindings.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-base-content/60">Dashboard filter</span>
        <button
          id="btnAddCubeBind"
          type="button"
          onClick={addBinding}
          title="Let a dashboard filter narrow this cube"
          className="p-0.5 rounded hover:bg-base-200 text-base-content/60 hover:text-base-content"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        </button>
      </div>

      {bindings.map((binding, i) => (
        <div key={i} className="flex items-center gap-1.5 ml-6">
          <select
            id={`selectCubeBindMember-${i}`}
            value={binding.member}
            onChange={(e) => changeMember(i, e.target.value)}
            className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content min-w-0 flex-1"
          >
            {/* A member the cube no longer has is still shown, so a saved binding is visible
                rather than silently reading as another dimension. */}
            {!memberNamed(binding.member) && binding.member && (
              <option value={binding.member}>{binding.member}</option>
            )}
            {members.map((member) => (
              <option key={member.name} value={member.name}>{member.name}</option>
            ))}
          </select>

          <select
            id={`selectCubeBindOp-${i}`}
            value={binding.operator ?? DEFAULT_BINDING_OPERATOR}
            onChange={(e) => changeOperator(i, e.target.value)}
            className="text-xs bg-base-100 border border-base-300 rounded px-1.5 py-1 text-base-content w-20"
          >
            {operatorsFor(binding.member).map((operator) => (
              <option key={operator.value} value={operator.value}>{operator.label}</option>
            ))}
          </select>

          <select
            id={`selectCubeBindParam-${i}`}
            value={binding.param}
            onChange={(e) => updateBinding(i, { param: e.target.value })}
            title={offers.find((offer) => offer.id === binding.param)
              ? offerTitle(offers.find((offer) => offer.id === binding.param)!)
              : "Bind to a dashboard filter, or to a value the server sets"}
            className="text-[11px] font-mono bg-base-100 border border-base-300 rounded px-1.5 py-1 text-primary min-w-0 flex-1"
          >
            {/* A parameter the dashboard no longer declares, kept visible for the same reason. */}
            {binding.param && !offers.some((offer) => offer.id === binding.param) && (
              <option value={binding.param}>{binding.param}</option>
            )}
            {offers.filter((offer) => !offer.fromServer).map((offer) => (
              <option key={offer.id} value={offer.id}>{offer.id}</option>
            ))}
            {offers.some((offer) => offer.fromServer) && (
              <optgroup label="Set by the server">
                {offers.filter((offer) => offer.fromServer).map((offer) => (
                  <option key={offer.id} value={offer.id}>{offer.id}</option>
                ))}
              </optgroup>
            )}
          </select>

          {/* The upper end of a `between`: a dashboard's date range is two parameters, from and
              to, and each end binds to one of them (F8). */}
          {bindingTakesTwoEnds(binding.operator ?? DEFAULT_BINDING_OPERATOR) && (
            <select
              id={`selectCubeBindParamTo-${i}`}
              value={binding.paramTo ?? ""}
              onChange={(e) => updateBinding(i, { paramTo: e.target.value })}
              title="The parameter holding the upper end of the range"
              className="text-[11px] font-mono bg-base-100 border border-base-300 rounded px-1.5 py-1 text-primary min-w-0 flex-1"
            >
              <option value="">to…</option>
              {binding.paramTo && !offers.some((offer) => offer.id === binding.paramTo) && (
                <option value={binding.paramTo}>{binding.paramTo}</option>
              )}
              {offers.map((offer) => (
                <option key={offer.id} value={offer.id}>{offer.id}</option>
              ))}
            </select>
          )}

          <button
            id={`btnRemoveCubeBind-${i}`}
            type="button"
            onClick={() => removeBinding(i)}
            className="p-0.5 rounded hover:bg-error/10 text-base-content/60 hover:text-error"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}

      {bindings.length > 0 && (
        <p className="text-[11px] text-base-content/60 ml-6">
          The published SQL carries {paramRefOf(bindings[0].param || "param")}; picking All in the
          dashboard leaves the filter out.
        </p>
      )}
    </div>
  );
}
