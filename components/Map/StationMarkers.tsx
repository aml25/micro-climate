"use client";

import { useCallback, useEffect, useState } from "react";
import { Source, Layer, useMap } from "react-map-gl/mapbox";
import type { CircleLayerSpecification, MapMouseEvent } from "react-map-gl/mapbox";
import { Tooltip, Divider } from "@heroui/react";
import { featureCollection, point } from "@turf/helpers";
import type { PWSStation } from "@/types/weather";

interface StationMarkersProps {
  stations: PWSStation[];
}

const stationCircleLayer: CircleLayerSpecification = {
  id: "station-circles",
  type: "circle",
  source: "station-points",
  paint: {
    "circle-radius": 5,
    "circle-color": "#ffffff",
    "circle-opacity": 0.85,
    "circle-stroke-width": 1,
    "circle-stroke-color": "#333333",
  },
};

interface HoveredStation {
  station: PWSStation;
  x: number;
  y: number;
}

export function StationMarkers({ stations }: StationMarkersProps) {
  const { current: map } = useMap();
  const [hovered, setHovered] = useState<HoveredStation | null>(null);

  const geojson = featureCollection(
    stations.map((s) =>
      point([s.lon, s.lat], {
        stationID: s.stationID,
        tempF: s.tempF,
        lastUpdateTime: s.lastUpdateTime,
        neighborhood: s.neighborhood,
      })
    )
  );

  const onMouseEnter = useCallback(
    (e: MapMouseEvent) => {
      if (!map) return;
      map.getCanvas().style.cursor = "pointer";
      const feature = e.features?.[0];
      if (!feature?.properties) return;
      const { stationID } = feature.properties as { stationID: string };
      const station = stations.find((s) => s.stationID === stationID);
      if (!station) return;
      setHovered({ station, x: e.point.x, y: e.point.y });
    },
    [map, stations]
  );

  const onMouseLeave = useCallback(() => {
    if (!map) return;
    map.getCanvas().style.cursor = "";
    setHovered(null);
  }, [map]);

  useEffect(() => {
    if (!map) return;
    map.on("mouseenter", "station-circles", onMouseEnter);
    map.on("mouseleave", "station-circles", onMouseLeave);
    return () => {
      map.off("mouseenter", "station-circles", onMouseEnter);
      map.off("mouseleave", "station-circles", onMouseLeave);
    };
  }, [map, onMouseEnter, onMouseLeave]);

  const updatedAgo = hovered
    ? Math.round(
        (Date.now() - new Date(hovered.station.lastUpdateTime).getTime()) /
          60000
      )
    : 0;

  return (
    <>
      <Source id="station-points" type="geojson" data={geojson}>
        <Layer {...stationCircleLayer} />
      </Source>

      {hovered && (
        <div
          style={{
            position: "absolute",
            left: hovered.x + 10,
            top: hovered.y - 10,
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <Tooltip
            isOpen
            content={
              <div className="flex flex-col gap-1 py-0.5 min-w-32">
                <p className="font-semibold text-small">
                  {hovered.station.neighborhood || hovered.station.stationID}
                </p>
                {hovered.station.neighborhood && (
                  <p className="text-tiny text-default-400">{hovered.station.stationID}</p>
                )}
                <Divider className="my-0.5" />
                <div className="flex flex-col gap-0.5 text-small">
                  <div className="flex justify-between gap-4">
                    <span className="text-default-400">Temp</span>
                    <span className="font-medium">{hovered.station.tempF.toFixed(1)}°F</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-default-400">Humidity</span>
                    <span className="font-medium">{hovered.station.humidity.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-default-400">Wind</span>
                    <span className="font-medium">{hovered.station.windspeedmph.toFixed(1)} mph</span>
                  </div>
                </div>
                <Divider className="my-0.5" />
                <p className="text-tiny text-default-400">Updated {updatedAgo}m ago</p>
              </div>
            }
          >
            <span />
          </Tooltip>
        </div>
      )}
    </>
  );
}
