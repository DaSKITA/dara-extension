function blocksGroup({ data, id }, { prevBlockData }) {
  return new Promise((resolve) => {
    const nextBlockId = this.getBlockConnections(id);

    if (data.blocks.length === 0) {
      resolve({
        nextBlockId,
        data: prevBlockData,
      });

      return;
    }

    const { blocks, connections } = data.blocks.reduce(
      (acc, block, index) => {
        const nextBlock = data.blocks[index + 1]?.itemId;

        acc.blocks[block.itemId] = {
          label: block.id,
          data: block.data,
          id: nextBlock ? block.itemId : id,
        };

        if (nextBlock) {
          const outputId = `${block.itemId}-output-1`;

          if (!acc.connections[outputId]) {
            acc.connections[outputId] = new Map();
          }
          acc.connections[outputId].set(nextBlock, { id: nextBlock });
        }

        return acc;
      },
      { blocks: {}, connections: {} }
    );

    Object.assign(this.engine.blocks, blocks);
    Object.assign(this.engine.connectionsMap, connections);

    resolve({
      data: prevBlockData,
      nextBlockId: [{ id: data.blocks[0].itemId }],
    });
  });
}

export default blocksGroup;
